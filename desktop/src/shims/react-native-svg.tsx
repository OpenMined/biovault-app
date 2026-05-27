import type { ReactNode } from 'react'

type SvgProps = {
  children?: ReactNode
  color?: string
  height?: number | string
  uri?: string
  width?: number | string
  [key: string]: unknown
}

export default function Svg({ children, height, width, ...props }: SvgProps) {
  return (
    <svg height={height} width={width} {...props}>
      {children}
    </svg>
  )
}

export function SvgUri({ uri, height, width }: SvgProps) {
  return <img src={uri} height={height} width={width} alt="" />
}

export function Path(props: SvgProps) {
  return <path {...props} />
}

export function Defs({ children }: SvgProps) {
  return <defs>{children}</defs>
}

export function LinearGradient({ children, ...props }: SvgProps) {
  return <linearGradient {...props}>{children}</linearGradient>
}

export function Stop(props: SvgProps) {
  return <stop {...props} />
}
