import fs from 'fs';
import path from 'path';

const MEDIA_DIR = 'src/media';

export function cleanMedia(): void {
  if (!fs.existsSync(MEDIA_DIR)) {
    console.log('Media directory does not exist, nothing to clean.');
    return;
  }

  const files = fs.readdirSync(MEDIA_DIR);
  let deletedCount = 0;

  for (const file of files) {
    const filePath = path.join(MEDIA_DIR, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true });
    } else {
      fs.unlinkSync(filePath);
    }
    deletedCount++;
  }

  console.log(`Deleted ${deletedCount} items from media directory.`);
}
