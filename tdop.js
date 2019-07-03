let global;             // The global object; the outermost context.
let tokens = []

//tokenize 会根据源代码并从中生成一个 token 对象数组。
function tokenize(source) {

  //如果源代码不是数组形式，则用回车符/换行符将源代码拆分为数组。
  lines = (
    Array.isArray(source)
      ? source
      : source.split(/\n|\r\n?/)
  );
  tokens = [];

  let char;                   // a popular character
  let column = 0;             // the column number of the next character
  let first;                  // the first token
  let from;                   // the starting column number of the token
  let line = -1;              // the line number of the next character
  let nr = 0;                 // the next token number
  let previous = global;      // the previous token including comments
  let prior = global;         // the previous token excluding comments
  let mega_from;              // the starting column of megastring
  let mega_line;              // the starting line of megastring
  let regexp_seen;            // regular expression literal seen on this line
  let snippet;                // a piece of string
  let source_line = "";       // the remaining line source string
  let whole_line = "";        // the whole line source string

  if (lines[0].startsWith("#!")) {
    line = 0;
    shebang = true;
  }

  function next_line() {
    // 将下一行源放在 source_line 中。
    // 如果该行包含制表符，请用空格替换它们并发出警告。
    // 如果该行包含不安全的字符或太长，也会发出警告。
    let at;
    if (
      !option.long
      && whole_line.length > 80
      && !json_mode
      && first
      && !regexp_seen
    ) {
      warn_at("too_long", line, 80);
    }
    column = 0;
    line += 1;
    regexp_seen = false;
    source_line = lines[line];
    whole_line = source_line || "";
    if (source_line !== undefined) {
      at = source_line.search(rx_tab);
      if (at >= 0) {
        if (!option.white) {
          warn_at("use_spaces", line, at + 1);
        }
        source_line = source_line.replace(rx_tab, " ");
      }
      at = source_line.search(rx_unsafe);
      if (at >= 0) {
        warn_at(
          "unsafe",
          line,
          column + at,
          "U+" + source_line.charCodeAt(at).toString(16)
        );
      }
      if (!option.white && source_line.slice(-1) === " ") {
        warn_at(
          "unexpected_trailing_space",
          line,
          source_line.length - 1
        );
      }
    }
    return source_line;
  }

  // 大多数令牌，包括标识符，运算符和标点符号，都可以使用正则表达式找到。
  // 正则表达式无法正确匹配正则表达式文字，因此我们将以艰难的方式匹配它们。
  // 字符串文字和数字文字可以由正则表达式匹配，但它们不提供良好的警告。
  // 函数snip，next_char，prev_char，some_digits和escape帮助解析文字。

  // 删除代码段的最后一个字符
  function snip() {
    snippet = snippet.slice(0, -1);
  }

  // 从源代码行获取下一个字符。
  // 从source_line中删除它，并将其附加到 snippet。
  // （可选）检查前一个字符是否与预期值匹配。
  function next_char(match) {
    if (match !== undefined && char !== match) {
      return stop_at(
        (
          char === ""
            ? "expected_a"
            : "expected_a_b"
        ),
        line,
        column - 1,
        match,
        char
      );
    }
    if (source_line) {
      char = source_line[0];
      source_line = source_line.slice(1);
      snippet += char;
    } else {
      char = "";
      snippet += " ";
    }
    column += 1;
    return char;
  }

  // 通过将字符从片段末尾移动到source_line的前面来备份一个字符。
  function back_char() {
    if (snippet) {
      char = snippet.slice(-1);
      source_line = char + source_line;
      column -= 1;
      snip();
    } else {
      char = "";
    }
    return char;
  }

  function some_digits(rx, quiet) {
    const result = source_line.match(rx);
    if (result) {
      char = result[1];
      column += char.length;
      source_line = result[2];
      snippet += char;
    } else {
      char = "";
      if (!quiet) {
        warn_at(
          "expected_digits_after_a",
          line,
          column,
          snippet
        );
      }
    }
    return char.length;
  }

  function escape(extra) {
    next_char("\\");
    if (escapeable[char] === true) {
      return next_char();
    }
    if (char === "") {
      return stop_at("unclosed_string", line, column);
    }
    if (char === "u") {
      if (next_char("u") === "{") {
        if (json_mode) {
          warn_at("unexpected_a", line, column - 1, char);
        }
        if (some_digits(rx_hexs) > 5) {
          warn_at("too_many_digits", line, column - 1);
        }
        if (next_char() !== "}") {
          stop_at("expected_a_before_b", line, column, "}", char);
        }
        return next_char();
      }
      back_char();
      if (some_digits(rx_hexs, true) < 4) {
        warn_at("expected_four_digits", line, column - 1);
      }
      return;
    }
    if (extra && extra.indexOf(char) >= 0) {
      return next_char();
    }
    warn_at("unexpected_a_before_b", line, column - 2, "\\", char);
  }

  // 创建一个 token 对象，并将其添加到 tokens 队列中
  function make(id, value, identifier) {

    const the_token = {
      from,
      id,
      identifier: Boolean(identifier),
      line,
      nr,
      thru: column
    };
    tokens[nr] = the_token;
    nr += 1;

    // Directives must appear before the first statement.

    if (id !== "(comment)" && id !== ";") {
      directive_mode = false;
    }

    // If the token is to have a value, give it one.

    if (value !== undefined) {
      the_token.value = value;
    }

    // If this token is an identifier that touches a preceding number, or
    // a "/", comment, or regular expression literal that touches a preceding
    // comment or regular expression literal, then give a missing space warning.
    // This warning is not suppressed by option.white.

    if (
      previous.line === line
      && previous.thru === from
      && (id === "(comment)" || id === "(regexp)" || id === "/")
      && (previous.id === "(comment)" || previous.id === "(regexp)")
    ) {
      warn(
        "expected_space_a_b",
        the_token,
        artifact(previous),
        artifact(the_token)
      );
    }
    if (previous.id === "." && id === "(number)") {
      warn("expected_a_before_b", previous, "0", ".");
    }
    if (prior.id === "." && the_token.identifier) {
      the_token.dot = true;
    }

    // The previous token is used to detect adjacency problems.

    previous = the_token;

    // The prior token is a previous token that was not a comment. The prior token
    // is used to disambiguate "/", which can mean division or regular expression
    // literal.

    if (previous.id !== "(comment)") {
      prior = previous;
    }
    return the_token;
  }

  function parse_directive(the_comment, body) {

    // JSLint recognizes three directives that can be encoded in comments. This
    // function processes one item, and calls itself recursively to process the
    // next one.

    const result = body.match(rx_directive_part);
    if (result) {
      let allowed;
      const name = result[1];
      const value = result[2];
      if (the_comment.directive === "jslint") {
        allowed = allowed_option[name];
        if (
          typeof allowed === "boolean"
          || typeof allowed === "object"
        ) {
          if (
            value === ""
            || value === "true"
            || value === undefined
          ) {
            option[name] = true;
            if (Array.isArray(allowed)) {
              populate(allowed, declared_globals, false);
            }
          } else if (value === "false") {
            option[name] = false;
          } else {
            warn("bad_option_a", the_comment, name + ":" + value);
          }
        } else {
          warn("bad_option_a", the_comment, name);
        }
      } else if (the_comment.directive === "property") {
        if (tenure === undefined) {
          tenure = empty();
        }
        tenure[name] = true;
      } else if (the_comment.directive === "global") {
        if (value) {
          warn("bad_option_a", the_comment, name + ":" + value);
        }
        declared_globals[name] = false;
        module_mode = the_comment;
      }
      return parse_directive(the_comment, result[3]);
    }
    if (body) {
      return stop("bad_directive_a", the_comment, body);
    }
  }

  function comment(snippet) {

    // Make a comment object. Comments are not allowed in JSON text. Comments can
    // include directives and notices of incompletion.

    const the_comment = make("(comment)", snippet);
    if (Array.isArray(snippet)) {
      snippet = snippet.join(" ");
    }
    if (!option.devel && rx_todo.test(snippet)) {
      warn("todo_comment", the_comment);
    }
    const result = snippet.match(rx_directive);
    if (result) {
      if (!directive_mode) {
        warn_at("misplaced_directive_a", line, from, result[1]);
      } else {
        the_comment.directive = result[1];
        parse_directive(the_comment, result[2]);
      }
      directives.push(the_comment);
    }
    return the_comment;
  }

  function regexp() {

    // Parse a regular expression literal.

    let multi_mode = false;
    let result;
    let value;
    regexp_seen = true;

    function quantifier() {

      // Match an optional quantifier.

      if (char === "?" || char === "*" || char === "+") {
        next_char();
      } else if (char === "{") {
        if (some_digits(rx_digits, true) === 0) {
          warn_at("expected_a", line, column, "0");
        }
        if (next_char() === ",") {
          some_digits(rx_digits, true);
          next_char();
        }
        next_char("}");
      } else {
        return;
      }
      if (char === "?") {
        next_char("?");
      }
    }

    function subklass() {

      // Match a character in a character class.

      if (char === "\\") {
        escape("BbDdSsWw-[]^");
        return true;
      }
      if (
        char === ""
        || char === "["
        || char === "]"
        || char === "/"
        || char === "^"
        || char === "-"
      ) {
        return false;
      }
      if (char === " ") {
        warn_at("expected_a_b", line, column, "\\u0020", " ");
      } else if (char === "`" && mega_mode) {
        warn_at("unexpected_a", line, column, "`");
      }
      next_char();
      return true;
    }

    function ranges() {

      // Match a range of subclasses.

      if (subklass()) {
        if (char === "-") {
          next_char("-");
          if (!subklass()) {
            return stop_at(
              "unexpected_a",
              line,
              column - 1,
              "-"
            );
          }
        }
        return ranges();
      }
    }

    function klass() {

      // Match a class.

      next_char("[");
      if (char === "^") {
        next_char("^");
      }
      (function classy() {
        ranges();
        if (char !== "]" && char !== "") {
          warn_at(
            "expected_a_before_b",
            line,
            column,
            "\\",
            char
          );
          next_char();
          return classy();
        }
      }());
      next_char("]");
    }

    function choice() {

      function group() {

        // Match a group that starts with left paren.

        next_char("(");
        if (char === "?") {
          next_char("?");
          if (char === "=" || char === "!") {
            next_char();
          } else {
            next_char(":");
          }
        } else if (char === ":") {
          warn_at("expected_a_before_b", line, column, "?", ":");
        }
        choice();
        next_char(")");
      }

      function factor() {
        if (
          char === ""
          || char === "/"
          || char === "]"
          || char === ")"
        ) {
          return false;
        }
        if (char === "(") {
          group();
          return true;
        }
        if (char === "[") {
          klass();
          return true;
        }
        if (char === "\\") {
          escape("BbDdSsWw^${}[]():=!.-|*+?");
          return true;
        }
        if (
          char === "?"
          || char === "+"
          || char === "*"
          || char === "}"
          || char === "{"
        ) {
          warn_at(
            "expected_a_before_b",
            line,
            column - 1,
            "\\",
            char
          );
        } else if (char === "`") {
          if (mega_mode) {
            warn_at("unexpected_a", line, column - 1, "`");
          }
        } else if (char === " ") {
          warn_at(
            "expected_a_b",
            line,
            column - 1,
            "\\s",
            " "
          );
        } else if (char === "$") {
          if (source_line[0] !== "/") {
            multi_mode = true;
          }
        } else if (char === "^") {
          if (snippet !== "^") {
            multi_mode = true;
          }
        }
        next_char();
        return true;
      }

      function sequence(follow) {
        if (factor()) {
          quantifier();
          return sequence(true);
        }
        if (!follow) {
          warn_at("expected_regexp_factor_a", line, column, char);
        }
      }

      // Match a choice (a sequence that can be followed by | and another choice).

      sequence();
      if (char === "|") {
        next_char("|");
        return choice();
      }
    }

    // Scan the regexp literal. Give a warning if the first character is = because
    // /= looks like a division assignment operator.

    snippet = "";
    next_char();
    if (char === "=") {
      warn_at("expected_a_before_b", line, column, "\\", "=");
    }
    choice();

    // Make sure there is a closing slash.

    snip();
    value = snippet;
    next_char("/");

    // Process dangling flag letters.

    const allowed = {
      g: true,
      i: true,
      m: true,
      u: true,
      y: true
    };
    const flag = empty();
    (function make_flag() {
      if (is_letter(char)) {
        if (allowed[char] !== true) {
          warn_at("unexpected_a", line, column, char);
        }
        allowed[char] = false;
        flag[char] = true;
        next_char();
        return make_flag();
      }
    }());
    back_char();
    if (char === "/" || char === "*") {
      return stop_at("unexpected_a", line, from, char);
    }
    result = make("(regexp)", char);
    result.flag = flag;
    result.value = value;
    if (multi_mode && !flag.m) {
      warn_at("missing_m", line, column);
    }
    return result;
  }

  function string(quote) {

    // Make a string token.

    let the_token;
    snippet = "";
    next_char();

    return (function next() {
      if (char === quote) {
        snip();
        the_token = make("(string)", snippet);
        the_token.quote = quote;
        return the_token;
      }
      if (char === "") {
        return stop_at("unclosed_string", line, column);
      }
      if (char === "\\") {
        escape(quote);
      } else if (char === "`") {
        if (mega_mode) {
          warn_at("unexpected_a", line, column, "`");
        }
        next_char("`");
      } else {
        next_char();
      }
      return next();
    }());
  }

  function frack() {
    if (char === ".") {
      some_digits(rx_digits);
      next_char();
    }
    if (char === "E" || char === "e") {
      next_char();
      if (char !== "+" && char !== "-") {
        back_char();
      }
      some_digits(rx_digits);
      next_char();
    }
  }

  function number() {
    if (snippet === "0") {
      next_char();
      if (char === ".") {
        frack();
      } else if (char === "b") {
        some_digits(rx_bits);
        next_char();
      } else if (char === "o") {
        some_digits(rx_octals);
        next_char();
      } else if (char === "x") {
        some_digits(rx_hexs);
        next_char();
      }
    } else {
      next_char();
      frack();
    }

    // If the next character after a number is a digit or letter, then something
    // unexpected is going on.

    if (
      (char >= "0" && char <= "9")
      || (char >= "a" && char <= "z")
      || (char >= "A" && char <= "Z")
    ) {
      return stop_at(
        "unexpected_a_after_b",
        line,
        column - 1,
        snippet.slice(-1),
        snippet.slice(0, -1)
      );
    }
    back_char();
    return make("(number)", snippet);
  }

  // 获取下一个词法单元
  function lex() {
    let array;
    let i = 0;
    let j = 0;
    let last;
    let result;
    let the_token;
    if (!source_line) {
      source_line = next_line();
      from = 0;
      return (
        source_line === undefined
          ? (
            mega_mode
              ? stop_at("unclosed_mega", mega_line, mega_from)
              : make("(end)")
          )
          : lex()
      );
    }
    from = column;
    // [ source, token, whitespace, identifier, number, rest ]
    // [ 源代码, 词法单元, 空格, 标识符, 数字, 剩余部分 ]
    const rx_token = /^((\s+)|([a-zA-Z_$][a-zA-Z0-9_$]*)|[(){}\[\],:;'"~`]|\?\.?|=(?:==?|>)?|\.+|[*\/][*\/=]?|\+[=+]?|-[=\-]?|[\^%]=?|&[&=]?|\|[|=]?|>{1,3}=?|<<?=?|!(?:!|==?)?|(0|[1-9][0-9]*))(.*)$/;
    result = source_line.match(rx_token);

    if (!result) {
      return stop_at(
        "unexpected_char_a",
        line,
        column,
        source_line[0]
      );
    }

    snippet = result[1];
    column += snippet.length;
    source_line = result[5];

    // 匹配到空格继续向下匹配
    if (result[2]) {
      return lex();
    }

    // 匹配到一个标识符
    if (result[3]) {
      return make(snippet, undefined, true);
    }

    // 匹配到一个数字
    if (result[4]) {
      return number(snippet);
    }

    // 匹配到一个字符串
    if (snippet === `"` || snippet === `'`) {
      return string(snippet);
    }

    // 匹配到一个模板字符，We don't allow any kind of mega nesting.
    if (snippet === "`") {
      if (mega_mode) {
        return stop_at("expected_a_b", line, column, "}", "`");
      }
      snippet = "";
      mega_from = from;
      mega_line = line;
      mega_mode = true;

      // 解析一个模板字符串比较困难，首先构造一个 ` token
      make("`");
      from += 1;

      // Then loop, building up a string, possibly from many lines, until seeing
      // the end of file, a closing `, or a ${ indicting an expression within the
      // string.

      (function part() {
        const at = source_line.search(rx_mega);

        // If neither ` nor ${ is seen, then the whole line joins the snippet.

        if (at < 0) {
          snippet += source_line + "\n";
          return (
            next_line() === undefined
              ? stop_at("unclosed_mega", mega_line, mega_from)
              : part()
          );
        }

        // if either ` or ${ was found, then the preceding joins the snippet to become
        // a string token.

        snippet += source_line.slice(0, at);
        column += at;
        source_line = source_line.slice(at);
        if (source_line[0] === "\\") {
          stop_at("escape_mega", line, at);
        }
        make("(string)", snippet).quote = "`";
        snippet = "";

        // If ${, then make tokens that will become part of an expression until
        // a } token is made.

        if (source_line[0] === "$") {
          column += 2;
          make("${");
          source_line = source_line.slice(2);
          (function expr() {
            const id = lex().id;
            if (id === "{") {
              return stop_at(
                "expected_a_b",
                line,
                column,
                "}",
                "{"
              );
            }
            if (id !== "}") {
              return expr();
            }
          }());
          return part();
        }
      }());
      source_line = source_line.slice(1);
      column += 1;
      mega_mode = false;
      return make("`");
    }

    // 匹配到一个注释 //
    if (snippet === "//") {
      snippet = source_line;
      source_line = "";
      the_token = comment(snippet);
      if (mega_mode) {
        warn("unexpected_comment", the_token, "`");
      }
      return the_token;
    }

    // 匹配到另一种形式的注释 /*
    if (snippet === "/*") {
      array = [];
      if (source_line[0] === "/") {
        warn_at("unexpected_a", line, column + i, "/");
      }
      (function next() {
        if (source_line > "") {
          i = source_line.search(rx_star_slash);
          if (i >= 0) {
            return;
          }
          j = source_line.search(rx_slash_star);
          if (j >= 0) {
            warn_at("nested_comment", line, column + j);
          }
        }
        array.push(source_line);
        source_line = next_line();
        if (source_line === undefined) {
          return stop_at("unclosed_comment", line, column);
        }
        return next();
      }());
      snippet = source_line.slice(0, i);
      j = snippet.search(rx_slash_star_or_slash);
      if (j >= 0) {
        warn_at("nested_comment", line, column + j);
      }
      array.push(snippet);
      column += i + 2;
      source_line = source_line.slice(i + 2);
      return comment(array);
    }

    // token 为一个 / 的情况
    if (snippet === "/") {
      // The / can be a division operator or the beginning of a regular expression
      // literal. It is not possible to know which without doing a complete parse.
      // We want to complete the tokenization before we begin to parse, so we will
      // estimate. This estimator can fail in some cases. For example, it cannot
      // know if "}" is ending a block or ending an object literal, so it can
      // behave incorrectly in that case; it is not meaningful to divide an
      // object, so it is likely that we can get away with it. We avoided the worst
      // cases by eliminating automatic semicolon insertion.

      // "/" 可以是除法运算符，也可以是正则表达式的开头。如果不进行完整的解析，就无法知道哪一个。
      if (prior.identifier) {
        if (!prior.dot) {
          if (prior.id === "return") {
            return regexp();
          }
          if (
            prior.id === "(begin)"
            || prior.id === "case"
            || prior.id === "delete"
            || prior.id === "in"
            || prior.id === "instanceof"
            || prior.id === "new"
            || prior.id === "typeof"
            || prior.id === "void"
            || prior.id === "yield"
          ) {
            the_token = regexp();
            return stop("unexpected_a", the_token);
          }
        }
      } else {
        last = prior.id[prior.id.length - 1];
        if ("(,=:?[".indexOf(last) >= 0) {
          return regexp();
        }
        if ("!&|{};~+-*%/^<>".indexOf(last) >= 0) {
          the_token = regexp();
          warn("wrap_regexp", the_token);
          return the_token;
        }
      }
      if (source_line[0] === "/") {
        column += 1;
        source_line = source_line.slice(1);
        snippet = "/=";
        warn_at("unexpected_a", line, column, "/=");
      }
    }
    // 构造一个 token
    return make(snippet);
  }

  first = lex();
  json_mode = first.id === "{" || first.id === "[";

  // todo: 后续改为递归调用
  while (true) {
    if (lex().id === "(end)") {
      break;
    }
  }
}
