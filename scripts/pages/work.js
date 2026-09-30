(() => {
  const content = document.querySelector('.work-content');
  if (!content) return;
  function openLinkedProject() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const project = document.getElementById(id);
    if (!project?.matches('details.project') || !content.contains(project)) return;
    content.querySelectorAll('details.project[open]').forEach(other => {
      if (other !== project) other.open = false;
    });
    project.open = true;
    requestAnimationFrame(() => project.scrollIntoView({ block: 'start', behavior: 'instant' }));
  }
  try { StudioContentList(content); } catch (error) { console.warn('Work motion unavailable:', error); }
  openLinkedProject();
  addEventListener('hashchange', openLinkedProject);
  const galleries = [...content.querySelectorAll('.project-gallery')];
  if (!galleries.length) return;
  import('../vflow/vflow.js').then(({ createVFlow }) => {
    galleries.forEach(container => {
      const images = [...container.querySelectorAll('figure')].map(figure => {
        const image = figure.querySelector('img');
        return { src: image?.getAttribute('src'), alt: image?.alt || '',
          caption: figure.querySelector('figcaption')?.textContent || '' };
      });
      const title = container.closest('.project').querySelector('summary').textContent;
      try { container.replaceWith(createVFlow(images, title)); }
      catch (error) { console.warn('Gallery kept as static images:', error); }
    });
  }).catch(error => console.warn('Gallery enhancement unavailable:', error));
})();
