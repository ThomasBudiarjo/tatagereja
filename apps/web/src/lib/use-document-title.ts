import { useEffect } from 'react';

const APP_TITLE = 'TataGereja';

/**
 * Sets `document.title` to "<title> · <context> · TataGereja" while the page is shown. Without
 * any part it leaves the title alone, so a layout can call it conditionally.
 */
export function useDocumentTitle(...parts: (string | null | undefined | false)[]) {
  const given = parts.filter((part): part is string => !!part);
  const title = given.length ? [...given, APP_TITLE].join(' · ') : null;
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}
