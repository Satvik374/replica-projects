import { EFFECT_CATEGORIES, effectsInCategory } from './engine/effectDefs';

export type MenuNode =
  | { kind: 'item'; label: string; command: string; shortcut?: string; disabled?: boolean }
  | { kind: 'sep' }
  | { kind: 'sub'; label: string; items: MenuNode[] };

export interface MenuRoot {
  label: string;
  items: MenuNode[];
}

const item = (label: string, command: string, shortcut?: string): MenuNode => ({
  kind: 'item',
  label,
  command,
  shortcut,
});
const sep: MenuNode = { kind: 'sep' };
const sub = (label: string, items: MenuNode[]): MenuNode => ({ kind: 'sub', label, items });

const effectMenus: MenuNode[] = EFFECT_CATEGORIES.map((category) =>
  sub(
    category,
    effectsInCategory(category).map((effect) => item(effect.name, `effect.add:${effect.id}`)),
  ),
);

export const MENUS: MenuRoot[] = [
  {
    label: 'File',
    items: [
      item('New Project', 'file.new', 'Ctrl+Alt+N'),
      item('New Composition…', 'file.newComp', 'Ctrl+N'),
      item('Open Project…', 'file.open', 'Ctrl+O'),
      item('Save', 'file.save', 'Ctrl+S'),
      item('Save As…', 'file.saveAs', 'Ctrl+Shift+S'),
      sep,
      item('Import Files…', 'file.import', 'Ctrl+I'),
      item('Composition Settings…', 'file.compSettings', 'Ctrl+K'),
      sep,
      item('Export Frame…', 'file.exportFrame', 'Ctrl+Shift+E'),
      item('Export Video…', 'file.exportVideo', 'Ctrl+M'),
      sep,
      item('Quit Cadence', 'file.quit', 'Ctrl+Q'),
    ],
  },
  {
    label: 'Edit',
    items: [
      item('Undo', 'edit.undo', 'Ctrl+Z'),
      item('Redo', 'edit.redo', 'Ctrl+Shift+Z'),
      sep,
      item('Cut', 'edit.cut', 'Ctrl+X'),
      item('Copy', 'edit.copy', 'Ctrl+C'),
      item('Paste', 'edit.paste', 'Ctrl+V'),
      item('Duplicate', 'edit.duplicate', 'Ctrl+D'),
      item('Delete', 'edit.delete', 'Delete'),
      sep,
      item('Select All', 'edit.selectAll', 'Ctrl+A'),
      item('Deselect All', 'edit.deselect', 'Ctrl+Shift+A'),
    ],
  },
  {
    label: 'Composition',
    items: [
      item('Composition Settings…', 'file.compSettings', 'Ctrl+K'),
      item('Duplicate Composition', 'comp.duplicate'),
      item('Delete Composition', 'comp.delete'),
      sep,
      item('Fit in Viewer', 'comp.fit', 'Shift+/'),
      item('Zoom In', 'comp.zoomIn', 'Ctrl+='),
      item('Zoom Out', 'comp.zoomOut', 'Ctrl+-'),
      item('Actual Size', 'comp.actual', 'Ctrl+1'),
      sep,
      item('Add Marker at Playhead', 'comp.marker', 'M'),
    ],
  },
  {
    label: 'Layer',
    items: [
      item('New Solid…', 'layer.solid', 'Ctrl+Y'),
      item('New Text Layer', 'layer.text', 'Ctrl+Alt+T'),
      item('New Rectangle', 'layer.rect', 'Ctrl+Alt+R'),
      item('New Ellipse', 'layer.ellipse', 'Ctrl+Alt+E'),
      item('New Star', 'layer.star'),
      item('New Null Object', 'layer.null', 'Ctrl+Alt+Shift+N'),
      item('New Adjustment Layer', 'layer.adjustment', 'Ctrl+Alt+Y'),
      sep,
      item('Bring Forward', 'layer.bringForward', 'Ctrl+Alt+]'),
      item('Send Backward', 'layer.sendBackward', 'Ctrl+Alt+['),
      sep,
      item('Set In Point to Playhead', 'layer.trimIn', '['),
      item('Set Out Point to Playhead', 'layer.trimOut', ']'),
      item('Split Layer at Playhead', 'layer.split', 'Ctrl+Shift+D'),
      sep,
      item('Detect Audio Beats', 'layer.detectBeats', 'Ctrl+Alt+B'),
      sep,
      item('Toggle Visibility', 'layer.visible', 'Ctrl+Shift+H'),
      item('Toggle Lock', 'layer.lock', 'Ctrl+Alt+L'),
      item('Toggle Solo', 'layer.solo', 'Ctrl+Alt+S'),
      sep,
      item('Duplicate', 'edit.duplicate', 'Ctrl+D'),
      item('Delete', 'edit.delete', 'Delete'),
    ],
  },
  {
    label: 'Effect',
    items: [
      item('Remove All Effects from Selection', 'effect.removeAll', 'Ctrl+Shift+Alt+E'),
      sep,
      ...effectMenus,
    ],
  },
  {
    label: 'Animation',
    items: [
      item('Add Keyframes for Transform', 'animation.addKeys', 'Ctrl+Alt+K'),
      sep,
      item('Easy Ease', 'animation.easyEase', 'F9'),
      item('Ease In', 'animation.easeIn', 'Shift+F9'),
      item('Ease Out', 'animation.easeOut', 'Ctrl+Shift+F9'),
      item('Linear', 'animation.linear'),
      item('Hold', 'animation.hold'),
      sep,
      item('Delete Selected Keyframes', 'animation.deleteKeys', 'Ctrl+Alt+Backspace'),
      item('Show Animated Properties Only', 'animation.animatedOnly', 'U'),
      item('Twirl Selected Layers', 'animation.twirl', 'Ctrl+`'),
      sep,
      item('Go to Previous Keyframe', 'animation.prevKey', 'J'),
      item('Go to Next Keyframe', 'animation.nextKey', 'K'),
      item('Go to Start', 'animation.start', 'Home'),
      item('Go to End', 'animation.end', 'End'),
    ],
  },
  {
    label: 'View',
    items: [
      item('Fit in Viewer', 'comp.fit', '0'),
      item('Actual Size', 'comp.actual', '1'),
      item('Zoom In', 'comp.zoomIn', 'Ctrl+='),
      item('Zoom Out', 'comp.zoomOut', 'Ctrl+-'),
      sep,
      item('Transparency Grid', 'toggle.transparency'),
      item('Safe Frames', 'toggle.safe'),
      item('Mask Outlines', 'toggle.masks'),
      item('Grid', 'toggle.grid'),
      sep,
      item('Reset Workspace', 'workspace.reset'),
    ],
  },
  {
    label: 'Window',
    items: [
      item('Project & Effects Panels', 'window.project'),
      item('Inspector Panels', 'window.inspector'),
      sep,
      item('Reset Workspace', 'workspace.reset'),
    ],
  },
  {
    label: 'Help',
    items: [
      item('Keyboard Shortcuts', 'help.shortcuts', 'Ctrl+Shift+/'),
      item('About Cadence', 'help.about'),
    ],
  },
];
