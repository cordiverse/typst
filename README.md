# cordis-plugin-typst

Typst 编译服务,同时兼容 cordis v3 与 cordis v4(含 HydroOJ)。

## 用法

```ts
import { Context } from 'cordis';
import TypstPlugin from 'cordis-plugin-typst';

ctx.plugin(TypstPlugin);

ctx.inject(['typst'], (c) => {
    const pdf = await c.typst.compiler()
        .mainFile('/index.typ')
        .file('/index.typ', '#set page(width: 10cm)\n= Hello')
        .to('pdf');
});
```

## API

- `ctx.typst.addFont(name, buffer)` — 追加字体(默认内置 DejaVu Sans Mono 与 Noto Sans SC)
- `ctx.typst.compiler()` — 新建编译会话:
  - `.mainFile(path)` — 指定主文件
  - `.file(path, source)` — 添加源文件
  - `.binary(path, buffer)` — 添加二进制影子文件
  - `.to(format)` — 编译,`format` 为 `'vector' | 'pdf' | 'svg' | 'plain-svg'`(`'svg'`/`'plain-svg'` 返回 SVG 字符串,前者含 Web 交互脚本,后者为自包含的精简版)

## License

MIT (compiler workflow forked from [typst.ts](https://github.com/Myriad-Dreamin/typst.ts), Apache-2.0)
