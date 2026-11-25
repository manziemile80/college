/**
 * Converts a selected image file into a small, square data URL that can be
 * stored directly in `profiles.avatar_url`. This avoids a Storage bucket
 * dependency for profile pictures.
 */
const AVATAR_SIZE = 256;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not open the selected image.'));
    image.src = src;
  });
}

export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file.');
  }

  const original = await readAsDataUrl(file);

  try {
    const image = await loadImage(original);
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (!side) return original;

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;

    const context = canvas.getContext('2d');
    if (!context) return original;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    );

    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    // An unusual image format may not be drawable to canvas; still allow it.
    return original;
  }
}
