/**
 * The strip at the screen's edge where your phone is, shown while a file is
 * dragged near it: it takes the drop (so the app underneath doesn't), and
 * says which files were let go. The light is drawn by Phone Drop's overlay.
 */
let over = false
const accept = (e: DragEvent) => {
  if (!e.dataTransfer || !Array.from(e.dataTransfer.items).some((i) => i.kind === 'file')) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
  if (!over) {
    over = true
    window.island.drop.edgeOver()
  }
}
document.addEventListener('dragenter', accept)
document.addEventListener('dragover', accept)
document.addEventListener('dragleave', () => (over = false))
document.addEventListener('drop', (e) => {
  e.preventDefault()
  over = false
  const paths = Array.from(e.dataTransfer?.files ?? [])
    .map((f) => window.island.drop.pathFor(f))
    .filter(Boolean)
  window.island.drop.edgeDrop(paths)
})
window.island.drop.edgeReady()
