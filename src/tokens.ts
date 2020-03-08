// 给每个对象绑定错误方法
Object.prototype.error = function (message: string, t: any) {
  t = t || this;
  t.name = "SyntaxError";
  t.message = message;
  throw t;
};

/**
 * 
 * @param {string} source 源代码
 * @param {string} prefix 前缀符 default( =<>!+-*&|/%^ )
 * @param {string} suffix 后缀符 default( =<>&| )
 */
export default (source: string, prefix?: string, suffix?: string) => {
  let length = source.length
  let c                      // 当前字符
  let i = 0                  // 当前字符索引
  let from                   // token 索引
  let n                      // 匹配的数字
  let q                      // 匹配的字符串标识("、')
  let str: string            // 当前匹配的字符集合

  const result: SimpleToken[] = [] // 返回的 token

  const make = (type: string, value: string): SimpleToken => {
    // Make a token object.
    return {
      type: type,
      value: value,
      from: from,
      to: i
    }
  };

  // Begin tokenization. If the source string is empty, return nothing.

  if (!source) {
    return;
  }

  // If prefix and suffix strings are not provided, supply defaults.

  if (typeof prefix !== 'string') {
    prefix = '=<>!+-*&|/%^';
  }
  if (typeof suffix !== 'string') {
    suffix = '=<>&|';
  }


  // Loop through this text, one character at a time.

  c = source.charAt(i);
  while (c) {
    from = i;

    // 跳过空格
    if (c <= ' ') {
      i += 1;
      c = source.charAt(i);
    }
    // 匹配变量名 a-z A-Z
    else if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
      str = c;
      i += 1;
      while (true) {
        c = source.charAt(i);
        if (
          (c >= 'a' && c <= 'z') 
          || (c >= 'A' && c <= 'Z') 
          || (c >= '0' && c <= '9') 
          || c === '_'
        ) {
          str += c;
          i += 1;
        } else {
          break;
        }
      }
      result.push(make('name', str));

    }
    // 匹配数字
    // 不能以 . 开头，必须是数字
    else if (c >= '0' && c <= '9') {
      str = c;
      i += 1;

      // 向后匹配更多数字
      while (true) {
        c = source.charAt(i);
        if (c < '0' || c > '9') {
          break;
        }
        i += 1;
        str += c;
      }

      // 向后匹配小数部分
      if (c === '.') {
        i += 1;
        str += c;
        while (true) {
          c = source.charAt(i);
          if (c < '0' || c > '9') {
            break;
          }
          i += 1;
          str += c;
        }
      }

      // 向后匹配指数部分
      if (c === 'e' || c === 'E') {
        i += 1;
        str += c;
        c = source.charAt(i);
        if (c === '-' || c === '+') {
          i += 1;
          str += c;
          c = source.charAt(i);
        }
        if (c < '0' || c > '9') {
          make('number', str).error("Bad exponent");
        }
        do {
          i += 1;
          str += c;
          c = source.charAt(i);
        } while (c >= '0' && c <= '9');
      }

      // 确保数字后面非字母
      if (c >= 'a' && c <= 'z') {
        str += c;
        i += 1;
        make('number', str).error("Bad number");
      }

      // 字符串转数字
      n = +str;

      // 确保该数字是一个有限的数字，
      if (isFinite(n)) {
        result.push(make('number', n));
      } else {
        make('number', str).error("Bad number");
      }

    }
    // 匹配字符串 
    else if (c === '\'' || c === '"') {
      str = '';
      q = c;
      i += 1;
      while (true) {
        c = source.charAt(i);
        if (c < ' ') {
          make('string', str).error(
            (c === '\n' || c === '\r' || c === '')
              ? "Unterminated string."
              : "Control character in string.",
            make('', str)
          );
        }

        // 匹配字符串是否结束
        if (c === q) {
          break;
        }

        // 字符串转义
        if (c === '\\') {
          i += 1;
          if (i >= length) {
            make('string', str).error("Unterminated string");
          }
          c = source.charAt(i);
          switch (c) {
            case 'b':
              c = '\b';
              break;
            case 'f':
              c = '\f';
              break;
            case 'n':
              c = '\n';
              break;
            case 'r':
              c = '\r';
              break;
            case 't':
              c = '\t';
              break;
            case 'u':
              if (i >= length) {
                make('string', str).error("Unterminated string");
              }
              c = parseInt(source.substr(i + 1, 4), 16);
              if (!isFinite(c) || c < 0) {
                make('string', str).error("Unterminated string");
              }
              c = String.fromCharCode(c);
              i += 4;
              break;
          }
        }
        str += c;
        i += 1;
      }
      i += 1;
      result.push(make('string', str));
      c = source.charAt(i);
    } 
    // 匹配注释
    else if (c === '/' && source.charAt(i + 1) === '/') {
      i += 1;
      while (true) {
        c = source.charAt(i);
        if (c === '\n' || c === '\r' || c === '') {
          break;
        }
        i += 1;
      }
    }
    // 匹配集合运算符
    else if (prefix.indexOf(c) >= 0) {
      str = c;
      i += 1;
      while (true) {
        c = source.charAt(i);
        if (i >= length || suffix.indexOf(c) < 0) {
          break;
        }
        str += c;
        i += 1;
      }
      result.push(make('operator', str));
    }
    // 匹配单个运算符
    else {
      i += 1;
      result.push(make('operator', c));
      c = source.charAt(i);
    }
  }
  return result;
}