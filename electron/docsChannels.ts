/** IPC channels for the island's Documents tab. */
export const DOCS = {
  VIEW: 'docs:view', // invoke -> DocsView
  CHANGED: 'docs:changed', // main -> renderer: files or recipes changed
  ADD: 'docs:add', // invoke(paths) -> DocsAdded
  PICK: 'docs:pick', // invoke: choose files to add -> DocsAdded
  REMOVE: 'docs:remove', // invoke(ids): take off the list (the files stay)
  OPEN: 'docs:open', // invoke(id): open with the usual app
  SHOW: 'docs:show', // invoke(id): show in the file manager
  OPEN_FOLDER: 'docs:open-folder', // invoke: open the folder results are saved in
  ACTION: 'docs:action', // invoke(DocAction) -> DocActionResult
  RECIPE_SAVE: 'docs:recipe-save', // invoke({ id?, name, instruction }) -> DocRecipe[]
  RECIPE_REMOVE: 'docs:recipe-remove', // invoke(id) -> DocRecipe[]
} as const
