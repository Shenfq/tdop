interface Object {
  error(message: string, t?: any): Error
}

interface SimpleToken {
  type: string
  value: string
  from: number
  to: number
}

interface Token {
  reserved: boolean
  from: number
  to: number
  id: string
  arity: string
  value: string
  lbp: number
  led: (left: Token) => Token
  nud: () => Token
  std?: () => {}
}