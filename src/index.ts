import fs from 'fs';
import type * as typst from '@myriaddreamin/typst-ts-web-compiler';
import { Service } from 'cordis';
import type { Context } from 'cordis';

const load = (name: string) => fs.readFileSync(require.resolve(name));

declare module 'cordis' {
    interface Context {
        typst: TypstService;
    }
}

export type CompileFormat = 'vector' | 'pdf';
export interface CompileOptions {
    mainFilePath: string;
    format?: CompileFormat;
}

class CompilerInstance {
    private mainFilePath = '/index.typ';
    private tailPromise: Promise<any>;

    constructor(private compilerPromise: Promise<typst.TypstCompiler>) {
        this.tailPromise = this.compilerPromise;
    }

    get compiler() {
        return Promise.all([this.compilerPromise, this.tailPromise]).then(([c]) => c);
    }

    reset() {
        this.tailPromise = this.compiler.then((r) => r.reset());
    }

    mainFile(filename: string) {
        this.mainFilePath = filename;
        return this;
    }

    file(path: string, source: string) {
        this.tailPromise = this.compiler.then((c) => c.add_source(path, source));
        return this;
    }

    binary(path: string, source: Buffer) {
        this.tailPromise = this.compiler.then((c) => c.map_shadow(path, source));
        return this;
    }

    to(format: CompileFormat) {
        // typst-ts-web-compiler 0.7: compile(main, inputs, fmt, diagnosticsFormat)
        return this.compiler.then(async (c) => {
            const r = await c.compile(this.mainFilePath, [], format, 0);
            if (!r) throw new Error(`typst compile failed: ${this.mainFilePath}`);
            return r;
        });
    }
}

export default class TypstService extends Service {
    compilerJs!: typeof typst;
    fonts: Record<string, Uint8Array> = {};

    constructor(ctx: Context) {
        super(ctx, 'typst');
    }

    async start(): Promise<void> {
        this.compilerJs = await import('@myriaddreamin/typst-ts-web-compiler');
        this.compilerJs.initSync(load('@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm'));
        this.addFont('DejaVuSansMono', load('dejavu-fonts-ttf/ttf/DejaVuSansMono.ttf'));
        this.addFont('NotoSans', load('@expo-google-fonts/noto-sans-sc/400Regular/NotoSansSC_400Regular.ttf'));
    }

    // cordis v3 calls start(), cordis v4 calls [Service.init]() only
    async [Service.init](): Promise<void> {
        await this.start();
    }

    addFont(name: string, fontBuffer: Buffer) {
        this.fonts[name] = new Uint8Array(fontBuffer);
        return this;
    }

    compiler() {
        const builder = new this.compilerJs.TypstCompilerBuilder();
        for (const v of Object.values(this.fonts)) builder.add_raw_font(v);
        return new CompilerInstance(builder.build());
    }
}
