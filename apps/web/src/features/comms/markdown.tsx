import { Bold, Italic, Link2, List, ListOrdered } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Segmented } from '@/components/ui/misc';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/*
 * Markdown-lite for announcements and bulletins: paragraphs, line breaks, **bold**, _italic_,
 * lists, short headings (##), quotes (>) and links. It is parsed into React elements, never
 * into HTML strings, so pasted markup is shown as text. Links only open http(s) and mailto.
 */

const SAFE_URL = /^(https?:\/\/|mailto:)/i;
const INLINE =
  /(\*\*([^*\n]+)\*\*)|(\[([^\]\n]+)\]\(([^)\s]+)\))|(_([^_\n]+)_)|(\*([^*\n]+)\*)|(https?:\/\/[^\s)<>]+)/;

function inline(text: string, key = 'i'): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let rest = text;
  let index = 0;
  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) {
      nodes.push(rest);
      break;
    }
    if (match.index > 0) nodes.push(rest.slice(0, match.index));
    const id = `${key}-${index}`;
    if (match[2]) {
      nodes.push(<strong key={id}>{inline(match[2], id)}</strong>);
    } else if (match[4] && match[5]) {
      nodes.push(
        SAFE_URL.test(match[5]) ? (
          <a
            key={id}
            href={match[5]}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="font-medium text-primary underline underline-offset-2"
          >
            {match[4]}
          </a>
        ) : (
          match[4]
        ),
      );
    } else if (match[7] || match[9]) {
      nodes.push(<em key={id}>{inline(match[7] ?? match[9] ?? '', id)}</em>);
    } else if (match[10]) {
      nodes.push(
        <a
          key={id}
          href={match[10]}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="break-all font-medium text-primary underline underline-offset-2"
        >
          {match[10]}
        </a>,
      );
    }
    rest = rest.slice(match.index + match[0].length);
    index += 1;
  }
  return nodes;
}

const withBreaks = (lines: string[], key: string) =>
  lines.flatMap((line, index) => [
    ...(index > 0 ? [<br key={`${key}-br-${index}`} />] : []),
    ...inline(line, `${key}-${index}`),
  ]);

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'h'; text: string }
  | { kind: 'quote'; lines: string[] };

function blocks(source: string): Block[] {
  const result: Block[] = [];
  for (const chunk of source.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const lines = chunk.split('\n').filter((line) => line.trim() !== '');
    let paragraph: string[] = [];
    const flush = () => {
      if (paragraph.length) result.push({ kind: 'p', lines: paragraph });
      paragraph = [];
    };
    for (const line of lines) {
      const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
      const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
      const heading = /^\s*#{1,3}\s+(.*)$/.exec(line);
      const quote = /^\s*>\s?(.*)$/.exec(line);
      const last = result[result.length - 1];
      if (bullet || numbered) {
        flush();
        const kind = bullet ? 'ul' : 'ol';
        const text = (bullet ?? numbered)?.[1] ?? '';
        if (last && last.kind === kind && paragraph.length === 0) last.items.push(text);
        else result.push({ kind, items: [text] });
      } else if (heading) {
        flush();
        result.push({ kind: 'h', text: heading[1] ?? '' });
      } else if (quote) {
        flush();
        if (last && last.kind === 'quote') last.lines.push(quote[1] ?? '');
        else result.push({ kind: 'quote', lines: [quote[1] ?? ''] });
      } else {
        paragraph.push(line);
      }
    }
    flush();
  }
  return result;
}

/** Renders markdown-lite safely. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const parsed = React.useMemo(() => blocks(source), [source]);
  return (
    <div
      className={cn('flex flex-col gap-3 text-[0.9375rem] leading-relaxed text-pretty', className)}
    >
      {parsed.map((block, index) => {
        const key = `b${index}`;
        switch (block.kind) {
          case 'p':
            return <p key={key}>{withBreaks(block.lines, key)}</p>;
          case 'h':
            return (
              <h3 key={key} className="pt-1 text-base font-semibold tracking-tight">
                {inline(block.text, key)}
              </h3>
            );
          case 'quote':
            return (
              <blockquote
                key={key}
                className="border-l-[3px] border-primary/40 pl-3.5 text-muted-foreground italic"
              >
                {withBreaks(block.lines, key)}
              </blockquote>
            );
          case 'ul':
          case 'ol': {
            const Tag = block.kind;
            return (
              <Tag
                key={key}
                className={cn(
                  'flex flex-col gap-1 pl-5',
                  block.kind === 'ul' ? 'list-disc' : 'list-decimal',
                )}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="pl-1 marker:text-muted-foreground">
                    {inline(item, `${key}-${itemIndex}`)}
                  </li>
                ))}
              </Tag>
            );
          }
        }
      })}
    </div>
  );
}

type ToolId = 'bold' | 'italic' | 'list' | 'numbered' | 'link';

type EditorProps = Omit<React.ComponentProps<'textarea'>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
};

/** A textarea with formatting buttons and a preview, for markdown-lite text. */
export const MarkdownEditor = React.forwardRef<HTMLTextAreaElement, EditorProps>(
  function MarkdownEditor({ value, onChange, className, rows = 8, ...props }, forwardedRef) {
    const { t } = useI18n();
    const [mode, setMode] = React.useState<'write' | 'preview'>('write');
    const frameId = React.useId();

    const apply = (
      transform: (selected: string) => { text: string; select?: [number, number] },
    ) => {
      // The textarea is found when a button is pressed, so no ref is read while rendering.
      const element = document.getElementById(frameId)?.querySelector('textarea');
      if (!element) return;
      const start = element.selectionStart;
      const end = element.selectionEnd;
      const { text, select } = transform(value.slice(start, end));
      const next = `${value.slice(0, start)}${text}${value.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => {
        element.focus();
        const [from, to] = select ?? [text.length, text.length];
        element.setSelectionRange(start + from, start + to);
      });
    };
    const wrap = (mark: string, placeholder: string) =>
      apply((selected) => {
        const inner = selected || placeholder;
        return {
          text: `${mark}${inner}${mark}`,
          select: [mark.length, mark.length + inner.length],
        };
      });
    const prefix = (marker: (index: number) => string, placeholder: string) =>
      apply((selected) => {
        const lines = (selected || placeholder).split('\n');
        return { text: lines.map((line, index) => `${marker(index)}${line}`).join('\n') };
      });

    const runTool = (id: ToolId) => {
      switch (id) {
        case 'bold':
          return wrap('**', t('comms.mdBoldSample'));
        case 'italic':
          return wrap('_', t('comms.mdItalicSample'));
        case 'list':
          return prefix(() => '- ', t('comms.mdListSample'));
        case 'numbered':
          return prefix((index) => `${index + 1}. `, t('comms.mdListSample'));
        case 'link':
          return apply((selected) => {
            const label = selected || t('comms.mdLinkSample');
            return { text: `[${label}](https://)`, select: [label.length + 3, label.length + 11] };
          });
      }
    };
    const tools: { id: ToolId; icon: typeof Bold; label: string }[] = [
      { id: 'bold', icon: Bold, label: t('comms.mdBold') },
      { id: 'italic', icon: Italic, label: t('comms.mdItalic') },
      { id: 'list', icon: List, label: t('comms.mdList') },
      { id: 'numbered', icon: ListOrdered, label: t('comms.mdNumbered') },
      { id: 'link', icon: Link2, label: t('comms.mdLink') },
    ];

    return (
      <div
        id={frameId}
        className={cn(
          'overflow-hidden rounded-lg border border-input bg-card shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30',
          props['aria-invalid'] && 'border-destructive',
          className,
        )}
      >
        <div className="flex items-center gap-1 border-b bg-sunken/60 px-1.5 py-1">
          {mode === 'write'
            ? tools.map((tool) => (
                <Button
                  key={tool.id}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-9 text-muted-foreground"
                  aria-label={tool.label}
                  title={tool.label}
                  onClick={() => runTool(tool.id)}
                >
                  <tool.icon />
                </Button>
              ))
            : null}
          <div className="ml-auto w-44">
            <Segmented
              value={mode}
              onChange={setMode}
              aria-label={t('comms.mdMode')}
              className="h-9"
              options={[
                { value: 'write', label: t('comms.mdWrite') },
                { value: 'preview', label: t('comms.mdPreview') },
              ]}
            />
          </div>
        </div>
        {mode === 'write' ? (
          <Textarea
            ref={forwardedRef}
            rows={rows}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="rounded-none border-0 shadow-none focus-visible:ring-0"
            {...props}
          />
        ) : (
          <div className="min-h-40 px-3.5 py-3">
            {value.trim() ? (
              <Markdown source={value} />
            ) : (
              <p className="text-sm text-muted-foreground">{t('comms.mdEmptyPreview')}</p>
            )}
          </div>
        )}
        <p className="border-t px-3.5 py-1.5 text-xs text-muted-foreground">{t('comms.mdHint')}</p>
      </div>
    );
  },
);
