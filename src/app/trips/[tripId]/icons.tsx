import type { SVGProps } from 'react';
export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & {
  name:
    | 'like'
    | 'comment'
    | 'plus'
    | 'back'
    | 'link'
    | 'chevron'
    | 'share'
    | 'more'
    | 'star'
    | 'bookmark'
    | 'close'
    | 'edit'
    | 'trash'
    | 'send'
    | 'arrow'
    | 'calendar'
    | 'check'
    | 'logout'
    | 'grip';
}) {
  const paths = {
    like: 'M7 10h3l3-7c3 0 3 3 2 6h4a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 2H7z',
    comment:
      'M21 11a8.5 8.5 0 0 1-9 9 10 10 0 0 1-4-1l-5 2 1.5-5A9 9 0 1 1 21 11Z',
    share: 'M12 15V3m-4 4 4-4 4 4M5 12v8h14v-8',
    more: 'M4 12h.01M12 12h.01M20 12h.01',
    star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
    bookmark: 'M6 3h12v18l-6-4-6 4z',
    close: 'm6 6 12 12M6 18 18 6',
    edit: 'm15 4 5 5M4 20l4-1L21 6l-4-4L4 15z',
    trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
    send: 'M12 19V5m-6 6 6-6 6 6',
    arrow: 'm9 5 7 7-7 7',
    plus: 'M12 5v14M5 12h14',
    back: 'm14 5-7 7 7 7',
    link: 'm9 15 6-6m-5-2 3-3a5 5 0 0 1 7 7l-3 3m-3 3-3 3a5 5 0 0 1-7-7l3-3',
    chevron: 'm6 9 6 6 6-6',
    calendar: 'M7 3v4m10-4v4M3 11h18',
    check: 'm5 12 4 4L19 6',
    logout: 'M9 3H4v18h5m5-5 5-4-5-4m-5 4h10',
    grip: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {name === 'grip' ? (
        [5, 12, 19].flatMap((cy) =>
          [9, 15].map((cx) => (
            <circle
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              r="1.2"
              fill="currentColor"
              stroke="none"
            />
          )),
        )
      ) : name === 'more' ? (
        <>
          <circle cx="5" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
        </>
      ) : (
        <>
          {name === 'calendar' && (
            <rect x="3" y="5" width="18" height="16" rx="2" />
          )}
          <path d={paths[name]} />
          {name === 'like' && <path className="thumb-line" d="M3 10h4v11H3z" />}
        </>
      )}
    </svg>
  );
}
