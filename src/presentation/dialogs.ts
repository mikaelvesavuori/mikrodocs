export function createDialogController(dialogs: HTMLDialogElement[]) {
  let lastDialogTrigger: HTMLElement | null = null;

  return {
    bindReturnFocus() {
      for (const dialog of dialogs) {
        dialog.addEventListener("close", () => {
          lastDialogTrigger?.focus();
          lastDialogTrigger = null;
        });
      }
    },

    closeById(id: string) {
      document.querySelector<HTMLDialogElement>(`#${id}`)?.close();
    },

    open(dialog: HTMLDialogElement) {
      lastDialogTrigger =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!dialog.open) {
        dialog.showModal();
      }
    },
  };
}

export function isTypingInField(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
