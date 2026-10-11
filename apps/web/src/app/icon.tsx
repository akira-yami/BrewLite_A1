import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default async function Icon() {
  const logo = await readFile(join(process.cwd(), 'public', 'logo.png'));
  const scale = 56 / 481;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        borderRadius: 12,
        background: '#FBF8F3',
      }}
    >
      {/* Show the B mark from the original logo, without the wordmark. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse uses native image elements. */}
      <img
        src={`data:image/png;base64,${logo.toString('base64')}`}
        alt=""
        style={{
          position: 'absolute',
          left: 4 - 48 * scale,
          top: 4 - 155 * scale,
          width: 1944 * scale,
          height: 809 * scale,
        }}
      />
    </div>,
    size,
  );
}
