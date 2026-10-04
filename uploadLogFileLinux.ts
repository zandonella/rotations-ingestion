import { supabase } from './lib/supabaseLinux.ts';
import fs from 'fs';
import path from 'path';

const filePath = process.argv[2];

if (!filePath) {
    console.error('Usage: node upload.js <file-path>');
    process.exit(1);
}

const localPath = path.resolve(process.cwd(), filePath);

if (!fs.existsSync(localPath)) {
    console.error('File not found:', localPath);
    process.exit(1);
}

const fileName = path.basename(localPath);

async function uploadFile(path: string) {
    const buffer = fs.readFileSync(localPath);

    const { data, error } = await supabase.storage
        .from('logs')
        .upload(fileName, buffer, {
            upsert: true,
            contentType: 'application/octet-stream',
        });

    if (error) {
        console.error('Upload failed:', error.message);
        process.exit(1);
    }

    console.log('Uploaded local file:', localPath);
    console.log('Bucket object:', data.path);
}

uploadFile(fileName).catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
});
