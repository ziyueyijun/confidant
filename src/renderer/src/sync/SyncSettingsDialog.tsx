// 同步设置对话框(01b;工作区级**模态**,不新开 BrowserWindow)。
// 入口:「文件 → 同步设置…」(Cmd.syncSettings)。
// 职责:展示/编辑地址、用户名、密码与「信任此服务器的证书」开关;「测试连接」区分
// 可达/认证失败/目录不存在;把票里的全部警告与说明文案显式呈现。
// 应用级纯逻辑在 ./sync-copy、./sync-url、./cloud-drive(均有单测)。

import { useEffect, useState } from "react";
import type { SyncConnectionResult, SyncSettingsView } from "@shared/sync";
import { normalizeBaseUrl, validateBaseUrl } from "./sync-url";
import { detectCloudDrive } from "./cloud-drive";
import {
  EXCLUSION_NOTICE,
  PLAINTEXT_NOTICE,
  cloudDriveNotice,
  connectionCopy,
  firstSyncMergeNotice,
  httpPasswordWarning,
  passwordStatusMessage,
  trustCertWarning,
  workspaceStateMessage,
} from "./sync-copy";

export interface SyncSettingsDialogProps {
  /** 当前工作区根路径;null = 未打开工作区(给明确空态)。 */
  workspacePath: string | null;
  onClose: () => void;
  /** 02:「立即同步」——由 App 负责 flush 后发起;未提供则隐藏该按钮。 */
  onSyncNow?: () => void;
  /** 同步进行中(禁用「立即同步」,决议 12)。 */
  syncRunning?: boolean;
}

/** 未打开工作区时的空视图(不触发 IPC)。 */
const EMPTY_VIEW: SyncSettingsView = {
  workspacePath: "",
  workspaceKey: "",
  workspaceExists: false,
  hasSavedConfig: false,
  baseUrl: "",
  username: "",
  trustSelfSignedCert: false,
  passwordStatus: "none",
  cloudEnv: { oneDrive: null, oneDriveConsumer: null, oneDriveCommercial: null },
};

export function SyncSettingsDialog({ workspacePath, onClose, onSyncNow, syncRunning }: SyncSettingsDialogProps) {
  const hasWorkspace = !!workspacePath;
  const [loaded, setLoaded] = useState(!hasWorkspace);
  const [view, setView] = useState<SyncSettingsView>(EMPTY_VIEW);
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  /** 用户是否动过密码框:动过才把密码交回主进程(否则复用已存密码)。 */
  const [passwordEdited, setPasswordEdited] = useState(false);
  const [trustCert, setTrustCert] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<SyncConnectionResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    setSaveNotice(null);
    setTestResult(null);
    setFormError(null);
    if (!workspacePath) {
      setView(EMPTY_VIEW);
      setBaseUrl("");
      setUsername("");
      setPassword("");
      setPasswordEdited(false);
      setTrustCert(false);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    void window.confidant
      .getSyncSettings(workspacePath)
      .then((v) => {
        if (!alive) return;
        setView(v);
        setBaseUrl(v.baseUrl);
        setUsername(v.username);
        setTrustCert(v.trustSelfSignedCert);
        setPassword("");
        setPasswordEdited(false);
        setLoaded(true);
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [workspacePath]);

  const stateMessage = workspaceStateMessage({
    workspacePath: workspacePath ?? "",
    workspaceExists: view.workspaceExists,
  });
  const disabled = !hasWorkspace || !view.workspaceExists;
  const httpWarn = httpPasswordWarning(baseUrl);
  const certWarn = trustCertWarning(trustCert);
  const pwdMsg = passwordStatusMessage(view.passwordStatus);
  const cloudNotice = cloudDriveNotice(detectCloudDrive(workspacePath ?? "", view.cloudEnv));
  const mergeNotice =
    testResult?.kind === "reachable"
      ? firstSyncMergeNotice(testResult.entryCount ?? 0, !view.hasSavedConfig)
      : null;
  const testCopy = testResult ? connectionCopy(testResult) : null;

  const buildInput = () => ({
    baseUrl: normalizeBaseUrl(baseUrl),
    username,
    password: passwordEdited ? password : undefined,
    trustSelfSignedCert: trustCert,
  });

  const onTest = async (): Promise<void> => {
    if (!workspacePath) return;
    const err = validateBaseUrl(baseUrl);
    if (err) {
      setFormError(err);
      setTestResult(null);
      return;
    }
    setFormError(null);
    setSaveNotice(null);
    setTesting(true);
    setTestResult(null);
    try {
      const res = await window.confidant.testSyncConnection({ workspacePath, ...buildInput() });
      setTestResult(res);
    } finally {
      setTesting(false);
    }
  };

  const onSave = async (): Promise<void> => {
    if (!workspacePath) return;
    const err = validateBaseUrl(baseUrl);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    setSaveNotice(null);
    setSaving(true);
    try {
      const res = await window.confidant.saveSyncSettings(workspacePath, buildInput());
      if (!res.ok) {
        setFormError(`保存失败:${res.error.message}`);
        return;
      }
      setPassword("");
      setPasswordEdited(false);
      setSaveNotice("已保存。密码经本机账户加密存放,不会写入工作区或远端。");
      setView(await window.confidant.getSyncSettings(workspacePath));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="sync-settings-dialog"
      style={overlayStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>同步设置</h2>
          <button type="button" onClick={onClose} style={{ ...btnStyle, padding: "2px 10px" }}>
            关闭
          </button>
        </div>

        <div style={{ fontSize: 12, color: "var(--muted)", wordBreak: "break-all" }}>
          {workspacePath ? `工作区:${workspacePath}` : "工作区:未打开"}
        </div>

        {stateMessage && (
          <div data-testid="sync-state-message" style={warnBoxStyle}>
            {stateMessage}
          </div>
        )}

        {loaded && !stateMessage && (
          <>
            {pwdMsg && (
              <div data-testid="sync-password-status" style={warnBoxStyle}>
                {pwdMsg}
              </div>
            )}

            <label style={fieldStyle}>
              <span style={labelStyle}>远端地址(完整 URL)</span>
              <input
                data-testid="sync-base-url"
                value={baseUrl}
                disabled={disabled}
                spellCheck={false}
                placeholder="https://nas:5006/dav/notes"
                onChange={(e) => {
                  setBaseUrl(e.target.value);
                  setFormError(null);
                }}
                style={inputStyle}
              />
            </label>

            <label style={fieldStyle}>
              <span style={labelStyle}>用户名</span>
              <input
                data-testid="sync-username"
                value={username}
                disabled={disabled}
                spellCheck={false}
                onChange={(e) => setUsername(e.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={fieldStyle}>
              <span style={labelStyle}>密码</span>
              <input
                data-testid="sync-password"
                type="password"
                value={password}
                disabled={disabled}
                placeholder={view.passwordStatus === "available" ? "已保存(留空则不修改)" : "请输入密码"}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordEdited(true);
                }}
                style={inputStyle}
              />
            </label>

            <label style={{ ...fieldStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                data-testid="sync-trust-cert"
                checked={trustCert}
                disabled={disabled}
                onChange={(e) => setTrustCert(e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>信任此服务器的证书(自签证书;默认关闭)</span>
            </label>

            {httpWarn && (
              <div data-testid="sync-http-warning" style={warnBoxStyle}>
                {httpWarn}
              </div>
            )}
            {certWarn && (
              <div data-testid="sync-cert-warning" style={warnBoxStyle}>
                {certWarn}
              </div>
            )}

            {formError && (
              <div data-testid="sync-form-error" style={{ ...warnBoxStyle, color: "var(--danger)" }}>
                {formError}
              </div>
            )}

            {testCopy && (
              <div
                data-testid="sync-test-result"
                style={{ ...infoBoxStyle, color: testCopy.tone === "ok" ? "#2e7d32" : "var(--danger)" }}
              >
                {testCopy.text}
              </div>
            )}

            {mergeNotice && (
              <div data-testid="sync-merge-notice" style={warnBoxStyle}>
                {mergeNotice}
              </div>
            )}

            {cloudNotice && (
              <div data-testid="sync-cloud-notice" style={infoBoxStyle}>
                {cloudNotice}
              </div>
            )}

            <div style={{ ...infoBoxStyle, display: "flex", flexDirection: "column", gap: 4 }}>
              <span>{PLAINTEXT_NOTICE}</span>
              <span style={{ color: "var(--muted)" }}>{EXCLUSION_NOTICE}</span>
            </div>

            {saveNotice && (
              <div data-testid="sync-save-notice" style={{ ...infoBoxStyle, color: "#2e7d32" }}>
                {saveNotice}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              {onSyncNow && (
                <button
                  type="button"
                  data-testid="sync-now-button"
                  onClick={onSyncNow}
                  disabled={disabled || !!syncRunning}
                  style={{ ...btnStyle, marginRight: "auto", background: "var(--accent-soft)" }}
                >
                  {syncRunning ? "同步中…" : "立即同步"}
                </button>
              )}
              <button
                type="button"
                data-testid="sync-test-button"
                onClick={() => void onTest()}
                disabled={disabled || testing}
                style={btnStyle}
              >
                {testing ? "测试中…" : "测试连接"}
              </button>
              <button
                type="button"
                data-testid="sync-save-button"
                onClick={() => void onSave()}
                disabled={disabled || saving}
                style={{ ...btnStyle, background: "var(--accent-soft)" }}
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--overlay)",
  zIndex: 60,
};

const cardStyle: React.CSSProperties = {
  width: 520,
  maxWidth: "92%",
  maxHeight: "86%",
  overflowY: "auto",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 16,
  boxShadow: "0 4px 18px var(--shadow)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  color: "inherit",
};

const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--muted)" };

const inputStyle: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "inherit",
  outline: "none",
};

const btnStyle: React.CSSProperties = {
  padding: "4px 14px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "inherit",
  cursor: "pointer",
};

const warnBoxStyle: React.CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.6,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--accent-soft)",
};

const infoBoxStyle: React.CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.6,
  padding: "6px 8px",
  borderRadius: 6,
  background: "transparent",
  border: "1px solid var(--border)",
};
