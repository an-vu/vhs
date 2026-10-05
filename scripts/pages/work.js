(() => {
  const content = document.querySelector('.work-content');
  if (!content) return;
  try { StudioContentList(content, { deepLinks: true }); }
  catch (error) { console.warn('Work motion unavailable:', error); }
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
