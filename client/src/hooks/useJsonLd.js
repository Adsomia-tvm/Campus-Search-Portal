import { useEffect } from 'react';

/**
 * Injects a JSON-LD <script> block into <head> and removes it on unmount.
 * Usage: useJsonLd({ "@type": "Organization", ... })
 */
export default function useJsonLd(schema) {
  useEffect(() => {
    if (!schema) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id   = `ld-${schema['@type'] || 'schema'}`;
    script.text = JSON.stringify({ '@context': 'https://schema.org', ...schema });
    document.head.appendChild(script);
    return () => {
      const el = document.getElementById(script.id);
      if (el) el.remove();
    };
  }, [JSON.stringify(schema)]); // eslint-disable-line react-hooks/exhaustive-deps
}
