/**
 * Ticket #20 acceptance criterion #6: the three-way conflict dialog
 * shown when a document has local unsaved changes *and* was also
 * changed externally. Native DOM modal (no framework), consistent with
 * #14/#18/#23's convention - see `src/renderer/src/editor/searchPanel.ts`
 * for the same "plain DOM, wired via callbacks" approach.
 */

export type ConflictChoice = 'keep-mine' | 'use-external' | 'save-as'

export interface ConflictDialogOptions {
  /** Basename or path shown in the dialog message. */
  fileLabel: string
}

/**
 * Shows the modal and resolves with the user's choice. The overlay
 * cannot be dismissed by clicking outside or pressing Escape - conflict
 * resolution ticket requires an explicit choice among exactly three
 * options (acceptance criterion #6), so there is deliberately no silent
 * "cancel" path that would leave the in-memory/on-disk state ambiguous.
 */
export function showConflictDialog(options: ConflictDialogOptions): Promise<ConflictChoice> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'cf-conflict-overlay'

    const dialog = document.createElement('div')
    dialog.className = 'cf-conflict-dialog'
    dialog.setAttribute('role', 'alertdialog')
    dialog.setAttribute('aria-modal', 'true')

    const title = document.createElement('h2')
    title.className = 'cf-conflict-title'
    title.textContent = '文件冲突'

    const message = document.createElement('p')
    message.className = 'cf-conflict-message'
    message.textContent = `"${options.fileLabel}" 在你有未保存改动的同时被外部程序修改了。请选择如何处理：`

    const actions = document.createElement('div')
    actions.className = 'cf-conflict-actions'

    function finish(choice: ConflictChoice): void {
      overlay.remove()
      resolve(choice)
    }

    const keepMineBtn = document.createElement('button')
    keepMineBtn.type = 'button'
    keepMineBtn.className = 'cf-conflict-btn cf-conflict-btn-primary'
    keepMineBtn.textContent = '保留我的版本（覆盖外部修改）'
    keepMineBtn.addEventListener('click', () => finish('keep-mine'))

    const useExternalBtn = document.createElement('button')
    useExternalBtn.type = 'button'
    useExternalBtn.className = 'cf-conflict-btn'
    useExternalBtn.textContent = '使用外部版本（放弃我的改动）'
    useExternalBtn.addEventListener('click', () => finish('use-external'))

    const saveAsBtn = document.createElement('button')
    saveAsBtn.type = 'button'
    saveAsBtn.className = 'cf-conflict-btn'
    saveAsBtn.textContent = '另存一份（保留两者）'
    saveAsBtn.addEventListener('click', () => finish('save-as'))

    actions.append(keepMineBtn, useExternalBtn, saveAsBtn)
    dialog.append(title, message, actions)
    overlay.appendChild(dialog)
    document.body.appendChild(overlay)

    keepMineBtn.focus()
  })
}
