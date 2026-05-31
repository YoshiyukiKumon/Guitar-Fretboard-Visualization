/** 再生系ツールバー（練習・ライブラリ・ソング）共通 UI */

export function createPlaybackToolbarField(
  labelText: string,
  control: HTMLElement,
  fieldClass?: string,
): HTMLElement {
  const field = document.createElement('div');
  field.className = fieldClass
    ? `playback-toolbar__field ${fieldClass}`
    : 'playback-toolbar__field';

  const label = document.createElement('span');
  label.className = 'playback-toolbar__label';
  label.textContent = labelText;

  field.appendChild(label);
  field.appendChild(control);
  return field;
}

export function createPlaybackToolbarPlayButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'playback-toolbar__play';
  return button;
}
