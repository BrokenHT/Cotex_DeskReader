import React, {useEffect, useState} from 'react';

const slides = [
  {title: 'Hy4 正式版发布', description: 'Agent 能力大幅跃升！限时免费体验', action: '立即使用'},
  {title: '混元Hy4「体验官」征集活动', description: '用Hy4完成一次真实创作，带话题发社媒分享使用体验与感受，赢积分及实物好礼', action: '立即参与'},
  {title: '做任务赢积分好礼', description: '连登抽取 Buddy 周边', action: '立即前往'},
];

export function BuddyPromo({onOpenLibrary, onDismiss}) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const slide = slides[index];

  useEffect(() => {
    if (hovered || focused) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer;
    const schedule = () => {
      clearTimeout(timer);
      if (!document.hidden && !motion.matches) {
        timer = setTimeout(() => setIndex(value => (value + 1) % slides.length), 6000);
      }
    };
    schedule();
    document.addEventListener('visibilitychange', schedule);
    motion.addEventListener('change', schedule);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', schedule);
      motion.removeEventListener('change', schedule);
    };
  }, [index, hovered, focused]);

  return <section className="buddy-promo" aria-label="推广轮播"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className="buddy-promo-copy">
      <strong>{slide.title}</strong>
      <p>{slide.description}</p>
    </div>
    {index === slides.length - 1 && <button type="button" className="buddy-promo-close"
      aria-label="本次隐藏推广轮播" onClick={onDismiss}>
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="m3 3 10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.2"/></svg>
    </button>}
    <div className="buddy-promo-footer">
      <div className="buddy-promo-dots" role="group" aria-label="选择推广卡片">
        {slides.map(({title}, position) => <button key={title} type="button" aria-label={title}
          aria-pressed={index === position} onClick={() => setIndex(position)} />)}
      </div>
      <button type="button" className="buddy-promo-action" title="打开资料库" onClick={onOpenLibrary}>{slide.action}</button>
    </div>
  </section>;
}
