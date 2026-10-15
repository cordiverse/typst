import fs from 'fs';
import { createRequire } from 'module';
import type * as typst from '@myriaddreamin/typst-ts-web-compiler';
import type * as renderer from '@myriaddreamin/typst-ts-renderer';
import { Service } from 'cordis';
import type { Context } from 'cordis';

const require = createRequire(import.meta.url);
const load = (name: string) => fs.readFileSync(require.resolve(name));

declare module 'cordis' {
    interface Context {
        typst: TypstService;
    }
}

export type CompileFormat = 'vector' | 'pdf' | 'svg' | 'plain-svg';
export interface CompileOptions {
    mainFilePath: string;
    format?: CompileFormat;
}

class CompilerInstance {
    private mainFilePath = '/index.typ';
    private tailPromise: Promise<any>;

    constructor(
        private compilerPromise: Promise<typst.TypstCompiler>,
        private rendererModule?: typeof renderer,
        private rendererPromise?: Promise<renderer.TypstRenderer>,
    ) {
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

    async to(format: CompileFormat) {
        // typst-ts-web-compiler 0.7: compile(main, inputs, fmt, diagnosticsFormat)
        if (format !== 'svg' && format !== 'plain-svg') {
            const compiler = await this.compiler;
            const result = await compiler.compile(this.mainFilePath, [], format, 0);
            if (!result) throw new Error(`typst compile failed: ${this.mainFilePath}`);
            return result;
        }

        if (!this.rendererModule || !this.rendererPromise) {
            throw new Error('typst renderer is not ready');
        }
        const [compiler, renderer] = await Promise.all([this.compiler, this.rendererPromise]);
        const vector = await compiler.compile(this.mainFilePath, [], 'vector', 0);
        if (!vector) throw new Error(`typst compile failed: ${this.mainFilePath}`);

        const options = new this.rendererModule.CreateSessionOptions();
        options.format = 'vector';
        options.artifact_content = vector;
        const session = renderer.create_session(options);
        try {
            // parts bitmask: body=1, defs=2, css=4, js=8; plain-svg keeps body+defs only.
            return format === 'svg'
                ? renderer.svg_data(session)
                : renderer.svg_data(session, 1 | 2);
        } finally {
            session.free();
        }
    }
}

export default class TypstService extends Service {
    compilerJs!: typeof typst;
    rendererJs?: typeof renderer;
    renderer?: Promise<renderer.TypstRenderer>;
    fonts: Record<string, Uint8Array> = {};

    constructor(ctx: Context) {
        super(ctx, 'typst');
    }

    async start(): Promise<void> {
        this.compilerJs = await import('@myriaddreamin/typst-ts-web-compiler');
        this.compilerJs.initSync(load('@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm'));
        this.rendererJs = await import('@myriaddreamin/typst-ts-renderer');
        this.rendererJs.initSync(load('@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm'));
        this.renderer = new this.rendererJs.TypstRendererBuilder().build();
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
        return new CompilerInstance(builder.build(), this.rendererJs, this.renderer);
    }
}
