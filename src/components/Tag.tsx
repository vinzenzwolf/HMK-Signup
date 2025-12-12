import './Tag.css'

function Tag({ children }: { children: string }) {
  return <span className="highlight-item">{children}</span>;
}

export default Tag