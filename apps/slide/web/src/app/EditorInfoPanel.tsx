export function EditorInfoPanel(props: { detail?: string; title: string }) {
  return (
    <div className="m-auto w-[min(720px,calc(100%_-_56px))] rounded-xl border border-white/10 bg-[#303030] p-7 shadow-[0_22px_80px_rgba(0,0,0,0.34)]">
      <h1 className="m-0 text-left text-[36px] font-extrabold leading-[1.18] text-white">{props.title}</h1>
      {props.detail ? <p className="text-white/58 leading-relaxed">{props.detail}</p> : null}
    </div>
  );
}
