import { useEffect } from 'react';

const SITE = 'Campus Search';

/**
 * Sets document.title for the current page.
 * Usage: usePageTitle('Search Colleges')  →  "Search Colleges | Campus Search"
 *        usePageTitle()                   →  "Campus Search"
 */
export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE}` : SITE;
    return () => { document.title = SITE; }; // reset on unmount
  }, [title]);
}
