import { ImageResponse } from 'next/og';

/** App icon drawn on the fly (no image files to maintain): a football on the dark club background. */
export function renderAppIcon(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#020617',
          fontSize: size * 0.62,
        }}
      >
        ⚽
      </div>
    ),
    { width: size, height: size }
  );
}
