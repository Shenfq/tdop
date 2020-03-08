import getTokens from './tokens'

// token 位于 tokens 的位置
let token_nr: number = 0
// token 集合
let tokens: SimpleToken[] = []
// 当前词法对象
let token: Token
// 当前作用域
let scope: Scope

const itself = function () {
  return this
}

/**
 * 作用域原型
 */
class Scope {
  public parent: Scope
  public def: {[key:string]: Token}
  constructor(parent) {
    // 当前作用域保存到 parent
    this.parent = parent
    this.def = {}
  }
  // 在当前作用域定义新变量
  define(token) {
    const has = this.def[token.value]
    if (typeof has === 'object') {
      token.error(has.reserved ? 'Already reserved.' : 'Already defined.')
    }
    this.def[token.value] = token
    token.reserved = false
    token.nud = itself
    token.led = null
    token.std = null
    token.lbp = 0
    token.scope = scope
    return token
  }
  find(val) {
    let current: Scope = this
    let token: Token
    while (true) {
      token = current.def[val];
      if (token && typeof token !== 'function') {
        return current.def[val]
      }
      current = current.parent
      if (!current) {
        token = symbolTable[val];
        return token && typeof token !== 'function'
          ? token
          : symbolTable['(name)']
      }
    }
  }
  pop() {
    scope = this.parent
  }
  reserve(token: Token) {
    if (token.arity !== 'name' || token.reserved) {
      return;
    }
    const def_token = this.def[token.value];
    if (def_token) {
      if (def_token.reserved) {
        return;
      }
      if (def_token.arity === 'name') {
        token.error('Already defined.');
      }
    }
    this.def[token.value] = token;
    token.reserved = true;
  }
}

/**
 * 创建新的作用域
 */
const newScope = () => {
  const parent = scope
  // 新的作用域实例
  scope = new Scope(parent)
  return scope
}

/**
 * 符号表
 */
const symbolTable = {}
/**
 * 符号原型
 */
class Symbol {
  // null denotation 空标志
  // 用于前缀运算符、值(变量、字面量)
  nud() {
    this.error('Undefined.')
  }
  // left denotation 左标志
  // 用于前缀运算符、后缀运算符
  led() {
    this.error('Missing operator.')
  }
}

/**
 * 创建符号
 * @param {string} id 符号名
 * @param {number} bp 约束力 
 */
const symbol = (id, bp = 0) => {
  let s = symbolTable[id]
  if (s) {
    if (bp >= s.lbp) {
      s.lbp = bp
    }
  } else {
    s = new Symbol()
    s.id = s.value = id
    s.lbp = bp
    symbolTable[id] = s
  }
  return s
}

/**
 * 创建常量
 * @param {*} id 常量名
 * @param {*} v 
 */
const constant = (id, v) => {
  var x = symbol(id);
  x.nud = function () {
    scope.reserve(this);
    this.value = symbolTable[this.id].value;
    this.arity = "literal";
    return this;
  };
  x.value = v;
  return x;
};

/**
 * 创建中缀运算符
 * @param {string} id 标识符
 * @param {number} bp 约束力
 * @param {function} led 
 */
const infix = (id, bp, led?: Function) => {
  var s = symbol(id, bp);
  s.led = led || function (left) {
    this.first = left;
    this.second = parse(bp);
    this.arity = "binary";
    return this;
  };
  return s;
};

/**
 * 创建中缀运算符
 * @param {string} id 标识符
 * @param {number} bp 约束力
 * @param {function} led 
 */
const infixr = (id, bp, led?: Function) => {
  var s = symbol(id, bp);
  s.led = led || function (left) {
    this.first = left;
    this.second = parse(bp - 1);
    this.arity = "binary";
    return this;
  };
  return s;
};

const assignment = (id) => {
  return infixr(id, 10, function (left) {
    if (left.id !== "." && left.id !== "[" && left.arity !== "name") {
      left.error("Bad lvalue.");
    }
    this.first = left;
    this.second = parse(9);
    this.assignment = true;
    this.arity = "binary";
    return this;
  });
};

const prefix = (id, nud?: Function) => {
  var s = symbol(id);
  s.nud = nud || function () {
    scope.reserve(this);
    this.first = parse(70);
    this.arity = "unary";
    return this;
  };
  return s;
};

const stmt = (s, f) => {
  var x = symbol(s);
  x.std = f;
  return x;
};


// 分割符与结束符
symbol(':')
symbol(';')
symbol(',')
symbol(')')
symbol(']')
symbol('}')
symbol('else')

symbol('(end)') // 单元结束符
symbol('(name)') // 命名符
symbol("(literal)").nud = itself
symbol("this").nud = function () {
  scope.reserve(this)
  this.arity = "this"
  return this
}

constant("true", true);
constant("false", false);
constant("null", null);
constant("Object", {});
constant("Array", []);

assignment("=");
assignment("+=");
assignment("-=");

infix("?", 20, function (left) {
  this.first = left;
  this.second = parse(0);
  next(":");
  this.third = parse(0);
  this.arity = "ternary";
  return this;
});

infix("+", 50);
infix("-", 50);

infix("*", 60);
infix("/", 60);

infix(".", 80, function (left) {
  this.first = left;
  if (token.arity !== "name") {
    token.error("Expected a property name.");
  }
  token.arity = "literal";
  this.second = token;
  this.arity = "binary";
  next();
  return this;
});

infix("[", 80, function (left) {
  this.first = left;
  this.second = parse(0);
  this.arity = "binary";
  next("]");
  return this;
});

infix("(", 80, function (left) {
  var a = [];
  if (left.id === "." || left.id === "[") {
    this.arity = "ternary";
    this.first = left.first;
    this.second = left.second;
    this.third = a;
  } else {
    this.arity = "binary";
    this.first = left;
    this.second = a;
    if ((left.arity !== "unary" || left.id !== "function") &&
      left.arity !== "name" && left.id !== "(" &&
      left.id !== "&&" && left.id !== "||" && left.id !== "?") {
      left.error("Expected a variable name.");
    }
  }
  if (token.id !== ")") {
    while (true) {
      a.push(parse(0));
      if (token.id !== ",") {
        break;
      }
      next(",");
    }
  }
  next(")");
  return this;
});

infixr("&&", 30)
infixr("||", 30)
infixr("===", 40)
infixr("!==", 40)
infixr("<", 40)
infixr("<=", 40)
infixr(">", 40)
infixr(">=", 40)

prefix("!");
prefix("-");
prefix("typeof");

prefix("(", function () {
  var e = parse(0);
  next(")");
  return e;
});

prefix("function", function () {
  var a = [];
  newScope();
  if (token.arity === "name") {
    scope.define(token);
    this.name = token.value;
    next();
  }
  next("(");
  if (token.id !== ")") {
    while (true) {
      if (token.arity !== "name") {
        token.error("Expected a parameter name.");
      }
      scope.define(token);
      a.push(token);
      next();
      if (token.id !== ",") {
        break;
      }
      next(",");
    }
  }
  this.first = a;
  next(")");
  next("{");
  this.second = statements();
  scope.pop();
  next("}");
  this.arity = "function";
  return this;
});

prefix("[", function () {
  var a = [];
  if (token.id !== "]") {
    while (true) {
      a.push(parse(0));
      if (token.id !== ",") {
        break;
      }
      next(",");
    }
  }
  next("]");
  this.first = a;
  this.arity = "unary";
  return this;
});

prefix("{", function () {
  var a = [];
  var n;
  var v;
  if (token.id !== "}") {
    while (true) {
      n = token;
      if (n.arity !== "name" && n.arity !== "literal") {
        token.error("Bad property name.");
      }
      next();
      next(":");
      v = parse(0);
      v.key = n.value;
      a.push(v);
      if (token.id !== ",") {
        break;
      }
      next(",");
    }
  }
  next("}");
  this.first = a;
  this.arity = "unary";
  return this;
});


stmt("{", function () {
  newScope();
  var a = statements();
  scope.pop();
  next("}");
  return a;
});

stmt("var", function () {
  var a = [];
  var n;
  var t;
  while (true) {
    n = token;
    if (n.arity !== "name") {
      n.error("Expected a new variable name.");
    }
    scope.define(n);
    next();
    if (token.id === "=") {
      t = token;
      next("=");
      t.first = n;
      t.second = parse(0);
      t.arity = "binary";
      a.push(t);
    }
    if (token.id !== ",") {
      break;
    }
    next(",");
  }
  next(";");
  return (a.length === 0)
    ? null
    : (a.length === 1)
      ? a[0]
      : a;
});

stmt("if", function () {
  next("(");
  this.first = parse(0);
  next(")");
  this.second = block();
  if (token.id === "else") {
    scope.reserve(token);
    next("else");
    // @ts-ignore
    this.third = (token.id === "if")
      ? statement()
      : block();
  } else {
    this.third = null;
  }
  this.arity = "statement";
  return this;
});

stmt("return", function () {
  if (token.id !== ";") {
    this.first = parse(0);
  }
  next(";");
  if (token.id !== "}") {
    token.error("Unreachable statement.");
  }
  this.arity = "statement";
  return this;
});

stmt("break", function () {
  next(";");
  if (token.id !== "}") {
    token.error("Unreachable statement.");
  }
  this.arity = "statement";
  return this;
});

stmt("while", function () {
  next("(");
  this.first = parse(0);
  next(")");
  this.second = block();
  this.arity = "statement";
  return this;
});

/**
 * 获取下一个 toekn ，创建一个词法对象
 * @param {string} id 指定下一个词法单元 
 */
const next = (id?: string ): void => {
  let t
  let proto
  let value
  let type

  if (id && token.id !== id) {
    token.error(`Expected "${id}".`)
  }

  if (token_nr >= tokens.length) {
    token = symbolTable['(end)']
    return
  }

  t = tokens[token_nr];
  token_nr += 1
  type = t.type
  value = t.value

  if (type === 'name') {
    proto = scope.find(value)
  } else if (type === 'operator') {
    proto = symbolTable[value]
    if (!proto) {
      t.error('Unknown operator.');
    }
  } else if (type === 'string' || type === 'number') {
    // 字面量
    type = 'literal'
    proto = symbolTable['(literal)']
  } else {
    t.error('Unexpected token.')
  }
  token = Object.create(proto)
  token.from = t.from;
  token.to = t.to;
  token.arity = type
  token.value = value
}

/**
 * 解析得到
 * @param {number} rbp 右约束力
 */
const parse = rbp => {
  let left
  let t = token
  next()
  left = t.nud()
  while (rbp < token.lbp) {
    t = token
    next()
    left = t.led(left)
  }
  return left
}

const statement = () => {
  let t = token
  let v
  if (t.std) {
    next()
    scope.reserve(t)
    return t.std()
  }
  v = parse(0)
  if (v.assignment && v.id !== '(') {
    v.error('Bad parse statement.')
  }
  next(';')
  return v
}

const statements = () => {
  const arr = []
  let state
  while (true) {
    if (token.id === "}" || token.id === "(end)") {
      break;
    }
    state = statement()
    if (state) {
      arr.push(state)
    }
  }
  return arr.length === 0
    ? null
    : arr.length === 1
      ? arr[0]
      : arr
}

const block = () => {
  const t = token
  next("{")
  return t.std()
}

export default (source) => {
  token_nr = 0
  tokens = getTokens(source)
  scope = null
  newScope()
  next()
  let s = statements()
  next("(end)")
  scope.pop()
  return s
}
