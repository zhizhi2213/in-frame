export function selectScenes(scenes, { category = 'all', query = '', view = 'explore', saved = [] } = {}) {
  const term = query.trim().toLocaleLowerCase();
  return scenes.filter(scene => {
    const content = [scene.category, scene.title, scene.subtitle, ...scene.tags, ...Object.values(scene.variants).flatMap(variant => [variant.title, ...variant.pose])].join(' ').toLocaleLowerCase();
    return (category === 'all' || scene.id === category) && (view !== 'saved' || saved.includes(scene.id)) && (!term || content.includes(term));
  });
}

export function selectPhotos(photos, { category = 'all', query = '', view = 'explore', saved = [] } = {}) {
  const term = query.trim().toLocaleLowerCase();
  return photos.filter(photo => {
    const content = [photo.category, photo.title, photo.takeaway, ...photo.tags, photo.level, photo.alt, photo.observation, photo.composition, photo.light, photo.pose, photo.album.author, photo.album.title, ...Object.values(photo.exercise).flat()].join(' ').toLocaleLowerCase();
    return (category === 'all' || photo.sceneId === category) && (view !== 'saved' || saved.includes(photo.id)) && (!term || content.includes(term));
  });
}

export function parseSaved(raw, validIds) {
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? [...new Set(data.filter(id => typeof id === 'string' && validIds.includes(id)))] : [];
  } catch {
    return [];
  }
}

export function toggleSaved(saved, id) {
  return saved.includes(id) ? saved.filter(item => item !== id) : [...saved, id];
}
