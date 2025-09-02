import { useState } from 'react';

export default function Downloader() {
    const [progress, setProgress] = useState<number>(0);
    const [status, setStatus] = useState<string>('');

    async function downloadZip(url: string) {
        setProgress(0);
        setStatus('Téléchargement...');

        const res = await fetch(url);
        if (!res.ok) throw new Error('Échec du téléchargement');

        const contentLength = Number(res.headers.get('content-length') || 0);
        const reader = res.body!.getReader();
        let receivedLength = 0;
        const chunks: BlobPart[] = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            chunks.push(value!);
            receivedLength += value!.length;

            if (contentLength) {
                setProgress(Math.round((receivedLength / contentLength) * 100));
            }
        }

        const blob = new Blob(chunks, { type: 'application/zip' });
        setStatus('Téléchargement terminé ✔️');

        // Ici tu peux garder le blob en mémoire, le stocker en IndexedDB, etc.
        console.log('ZIP téléchargé :', blob);
    }

    return (
        <div>
            <button
                onClick={() =>
                    downloadZip(
                        'https://github.com/twbs/bootstrap/archive/refs/heads/main.zip'
                    )
                }
            >
                Télécharger Bootstrap ZIP
            </button>

            {status && <p>{status}</p>}

            <div style={{ width: '300px', height: '10px', background: '#ccc' }}>
                <div
                    style={{
                        width: `${progress}%`,
                        height: '100%',
                        background: 'green',
                        transition: 'width 0.2s',
                    }}
                />
            </div>

            <p>{progress}%</p>
        </div>
    );
}
