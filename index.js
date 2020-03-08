const parse = require('./dist/parse').default

const code = `
var a = 1;
var b = 5;
var c = a + b;
`

const ast = parse(code)

console.log(ast)