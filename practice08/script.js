import { WebGLUtility } from '../lib/webgl.js';
import { Mat4, Vec3 } from '../lib/math.js';
import { WebGLGeometry } from '../lib/geometry.js';
import { Pane } from '../lib/tweakpane-4.0.3.min.js';

window.addEventListener('DOMContentLoaded', async () => {
  const app = new App();
  app.init();
  app.setupPane(); // tweakpane の初期化をメソッド化 @@@
  await app.load();
  app.setupGeometry();
  app.setupLocation();
  app.initializeBuffer(); // バッファに初期状態をセット @@@
  app.start();
}, false);

/**
 * アプリケーション管理クラス
 */
class App {
  canvas;            // WebGL で描画を行う canvas 要素
  gl;                // WebGLRenderingContext （WebGL コンテキスト）
  program;           // WebGLProgram （プログラムオブジェクト）
  solverProgram;  // ジャコビ反復計算用のプログラムオブジェクト
  advectionProgram; // アドベクション用のプログラムオブジェクト
  perlinProgram; // パーリンノイズ用のプログラムオブジェクト
  blitProgram;    // フレームバッファの内容を画面に描画するためのプログラムオブジェクト
  attributeLocations = []; // attribute 変数のロケーション
  attributeStride;   // attribute 変数のストライド
  uniformLocations = [];   // uniform 変数のロケーション
  planeGeometry;     // 板ポリゴンのジオメトリ情報
  planeVBO;          // 板ポリゴンの頂点バッファ
  planeIBO;          // 板ポリゴンのインデックスバッファ
  startTime;         // レンダリング開始時のタイムスタンプ
  shouldTargetA;      // 現在の描画ターゲットが bufferA にするかどうかのフラグ
  initialized = false; // 初期状態をセットしたかどうかのフラグ
  initialTexture; // dyeの初期状態
  quadMvpMatrix; // 板ポリゴン描画用の MVP 行列

  // --- buffer ---
  velocityBuffer; // 速度場 (RG16) (一旦RGBA32)
  velocityBufferTemp; // 速度場一時バッファ (RG16) (一旦RGBA32)
  velocityDivergenceBuffer; // 速度場の発散を格納するバッファ
  pressureBuffer;   // 圧力場 (R16) (一旦RGBA32)
  dyeBuffer;      // 染料場 (R8)   (一旦RGBA32)
  dyeBufferTemp;  // 染料場一時バッファ (R8) (一旦RGBA32)
  tempRG16BufferA;   // RG16一時バッファA (一旦RGBA32)
  tempRG16BufferB;   // RG16一時バッファB (一旦RGBA32)
  tempR8BufferA;    // R8一時バッファA (一旦RGBA32)
  tempR8BufferB;    // R8一時バッファB (一旦RGBA32)

  constructor() {
    // this を固定するためのバインド処理
    this.resize = this.resize.bind(this);
    this.render = this.render.bind(this);
    this.handleClick = this.handleClick.bind(this); // クリックハンドラーをバインド @@@
  }

  /**
   * 初期化処理を行う
   */
  init() {
    // canvas エレメントの取得と WebGL コンテキストの初期化
    this.canvas = document.getElementById('webgl-canvas');
    this.gl = this.canvas.getContext('webgl2');

    // カメラ制御用インスタンスを生成する
    const cameraOption = {
      distance: 5.0, // Z 軸上の初期位置までの距離
      min: 1.0,      // カメラが寄れる最小距離
      max: 10.0,     // カメラが離れられる最大距離
      move: 2.0,     // 右ボタンで平行移動する際の速度係数
    };

    // 最初に一度リサイズ処理を行っておく
    this.resize();

    // リサイズイベントの設定
    window.addEventListener('resize', this.resize, false);
    
    // クリックイベントの設定 @@@
    // this.canvas.addEventListener('click', this.handleClick, false);

    // 深度テストは初期状態で有効
    this.gl.enable(this.gl.DEPTH_TEST);

    this.quadMvpMatrix = this.calcMvp();

  }

  /**
   * tweakpane の初期化処理
   */
  setupPane() {
    // Tweakpane を使った GUI の設定
    const pane = new Pane();
    const parameter = {
      'timeScale': this.timeScale
    };
    // テクスチャの表示・非表示 @@@
    pane.addBinding(parameter, 'timeScale')
    .on('change', (v) => {
      this.timeScale = v.value;
    });
  }

  /**
   * クリック処理
   */
  handleClick(event) {
    // クリック座標を取得（必要に応じて）
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    console.log(`クリック座標: (${x}, ${y})`);
    
    // レンダリングを実行
    this.render();
  }

  /**
   * リサイズ処理
   */
  resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    
    // WebGL のビューポートも更新
    if (this.gl) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * 各種リソースのロードを行う
   * @return {Promise}
   */
  load() {
    return new Promise(async (resolve, reject) => {
      const gl = this.gl;
      if (gl == null) {
        // もし WebGL コンテキストがない場合はエラーとして Promise を reject する
        const error = new Error('not initialized');
        reject(error);
      } else {
        // シェーダのソースコードを読み込みシェーダとプログラムオブジェクトを生成する
        const VSSource = await WebGLUtility.loadFile('./main.vert');
        const FSSource = await WebGLUtility.loadFile('./main.frag');
        const vertexShader = WebGLUtility.createShaderObject(gl, VSSource, gl.VERTEX_SHADER);
        const fragmentShader = WebGLUtility.createShaderObject(gl, FSSource, gl.FRAGMENT_SHADER);
        this.program = WebGLUtility.createProgramObject(gl, vertexShader, fragmentShader);

        const solverFSource = await WebGLUtility.loadFile('./jaccobi_solver.frag');
        const solverVShader = WebGLUtility.createShaderObject(gl, VSSource, gl.VERTEX_SHADER);
        const solverFShader = WebGLUtility.createShaderObject(gl, solverFSource, gl.FRAGMENT_SHADER);
        this.solverProgram = WebGLUtility.createProgramObject(gl, solverVShader, solverFShader);

        const advectionFSource = await WebGLUtility.loadFile('./advection.frag');
        const advectionVShader = WebGLUtility.createShaderObject(gl, VSSource, gl.VERTEX_SHADER);
        const advectionFShader = WebGLUtility.createShaderObject(gl, advectionFSource, gl.FRAGMENT_SHADER);
        this.advectionProgram = WebGLUtility.createProgramObject(gl, advectionVShader, advectionFShader);

        const blitFSource = await WebGLUtility.loadFile('./blit.frag');
        const blitVShader = WebGLUtility.createShaderObject(gl, VSSource, gl.VERTEX_SHADER);
        const blitFShader = WebGLUtility.createShaderObject(gl, blitFSource, gl.FRAGMENT_SHADER);
        this.blitProgram = WebGLUtility.createProgramObject(gl, blitVShader, blitFShader);

        const perlinFSource = await WebGLUtility.loadFile('./perlin.frag');
        const perlinVShader = WebGLUtility.createShaderObject(gl, VSSource, gl.VERTEX_SHADER);
        const perlinFShader = WebGLUtility.createShaderObject(gl, perlinFSource, gl.FRAGMENT_SHADER);
        this.perlinProgram = WebGLUtility.createProgramObject(gl, perlinVShader, perlinFShader);

        // フレームバッファを生成する @@@
        // リサイズが完了してからフレームバッファを作成
        this.resize(); // サイズを再設定
        this.velocityBuffer = WebGLUtility.createFramebuffer(gl, this.canvas.width, this.canvas.height);
        this.dyeBuffer = WebGLUtility.createFramebuffer(gl, this.canvas.width, this.canvas.height);
        this.tempRG16BufferA = WebGLUtility.createFramebuffer(gl, this.canvas.width, this.canvas.height);
        this.tempRG16BufferB = WebGLUtility.createFramebuffer(gl, this.canvas.width, this.canvas.height);
        this.tempR8BufferA = WebGLUtility.createFramebuffer(gl, this.canvas.width, this.canvas.height);
        this.tempR8BufferB = WebGLUtility.createFramebuffer(gl, this.canvas.width, this.canvas.height);
        this.shouldTargetA = true;

        await WebGLUtility.loadImage('../textures/earth.jpg').then((image) => {
          this.initialTexture = WebGLUtility.createTexture(gl, image);
        });

        // Promise を解決
        resolve();
      }
    });
  }

  /**
   * 頂点属性（頂点ジオメトリ）のセットアップを行う
   */
  setupGeometry() {
    // プレーンジオメトリの情報を取得
    const size = 2.0;
    const color = [1.0, 1.0, 1.0, 1.0];
    this.planeGeometry = WebGLGeometry.plane(size, size, color);

    // VBO と IBO を生成する
    this.planeVBO = [
      WebGLUtility.createVBO(this.gl, this.planeGeometry.position),
      WebGLUtility.createVBO(this.gl, this.planeGeometry.normal),
      WebGLUtility.createVBO(this.gl, this.planeGeometry.color),
      WebGLUtility.createVBO(this.gl, this.planeGeometry.texCoord), // テクスチャ座標 @@@
    ];
    this.planeIBO = WebGLUtility.createIBO(this.gl, this.planeGeometry.index);
  }

  /**
   * 頂点属性のロケーションに関するセットアップを行う
   */
  setupLocation() {
    const gl = this.gl;
    // --- attribute ---
    // attribute location の取得
    for (program of [this.solverProgram, this.blitProgram, this.perlinProgram, this.advectionProgram]) {
      this.attributeLocations[program] = {
        position: gl.getAttribLocation(program, 'position'),
        normal: gl.getAttribLocation(program, 'normal'),
        color: gl.getAttribLocation(program, 'color'),
        texCoord: gl.getAttribLocation(program, 'texCoord'), // テクスチャ座標 @@@
      };
    };
    // attribute のストライド
    this.attributeStride = [
      3,
      3,
      4,
      2, // ストライドは２ @@@
    ];

    // --- uniform ---
    // uniform location の取得
    for (program of [this.solverProgram, this.blitProgram, this.perlinProgram, this.advectionProgram]) {
      this.uniformLocations[program] = {
        time: gl.getUniformLocation(program, 'u_time'),
        resolution: gl.getUniformLocation(program, 'u_resolution'),
      };
    }
    Object.assign(this.uniformLocations[this.solverProgram], {
      bufferTexture: gl.getUniformLocation(this.solverProgram, 'u_bufferTexture'),
      centerFactor: gl.getUniformLocation(this.solverProgram, 'u_centerFactor'),
      beta: gl.getUniformLocation(this.solverProgram, 'u_beta'),
      initialTexture: gl.getUniformLocation(this.solverProgram, 'u_initialTexture'),
    });
    Object.assign(this.uniformLocations[this.blitProgram], {
      bufferTexture: gl.getUniformLocation(this.blitProgram, 'u_bufferTexture'),
    });
    Object.assign(this.uniformLocations[this.advectionProgram], {
      velocityTexture: gl.getUniformLocation(this.advectionProgram, 'u_velocityTexture'),
      sourceTexture: gl.getUniformLocation(this.advectionProgram, 'u_textureToAdvect'),
      dissapation: gl.getUniformLocation(this.advectionProgram, 'u_dissapationFactor'),
    });
  }

  /**
   * レンダリングのためのセットアップを行う
   */
  setupRendering() {
    const gl = this.gl;
    // ビューポートを設定する
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    // クリアする色と深度を設定する
    gl.clearColor(0.3, 0.3, 0.3, 1.0);
    gl.clearDepth(1.0);
    // 色と深度をクリアする
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  /**
   * 描画を開始する
   */
  start() {
    // レンダリング開始時のタイムスタンプを取得しておく
    this.startTime = Date.now();
    // レンダリングを行っているフラグを立てておく
    this.isRendering = true;
    // レンダリングの開始
    this.render();
  }

  /**
   * 描画を停止する
   */
  stop() {
    this.isRendering = false;
  }

  calcMvp() {
    const m = Mat4.identity();
    const v = Mat4.lookAt(Vec3.create(0, 0, -1), Vec3.create(0, 0, 0), Vec3.create(0, 1, 0));
    const aspect = window.innerWidth / window.innerHeight;
    const near = 0.1
    const far = 10.0;
    if (aspect > 1.0) {
      const top = 1.0 / aspect;
      const bottom = -top;
      const left = -1.0;
      const right = 1.0;
      var p = Mat4.ortho(left, right, top, bottom, near, far);
    } else {
      const right = aspect;
      const left = -right;
      const top = 1.0;
      const bottom = -top;
      var p = Mat4.ortho(left, right, top, bottom, near, far);
    }

    // 行列を乗算して MVP 行列を生成する（掛ける順序に注意）
    const vp = Mat4.multiply(p, v);
    const mvp = Mat4.multiply(vp, m);

    return mvp;

    // モデル座標変換行列の、逆転置行列を生成する
    // const normalMatrix = Mat4.transpose(Mat4.inverse(m));
  }

  initializeBuffer() {
    if( this.initialized ) return;
    const gl = this.gl;

    // velocityBuffer の初期化
    let program = this.perlinProgram;
    gl.useProgram(program);
    this.setupRendering();
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocations[program], this.attributeStride, this.planeIBO);
    gl.uniformMatrix4fv(this.uniformLocations[program].mvpMatrix, false, this.quadMvpMatrix);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityBuffer.framebuffer);
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

    // dyeBuffer の初期化
    program = this.blitProgram;
    gl.useProgram(program);
    this.setupRendering();
    gl.uniformMatrix4fv(this.uniformLocations[program].mvpMatrix, false, this.quadMvpMatrix);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.dyeBuffer.framebuffer);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.initialTexture);
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);
    
    this.initialized = true;
  }

  diffuse(sourceBuffer, destBuffer) {
    const gl = this.gl;
    let program = this.solverProgram;
    gl.useProgram(program);
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocations[program], this.attributeStride, this.planeIBO);
    gl.uniformMatrix4fv(this.uniformLocations[program].mvpMatrix, false, this.quadMvpMatrix);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceBuffer.texture);

    const itter = 10;
    for (let i = 0; i < itter; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER,
        i == (itter - 1) ? destBuffer.framebuffer :
        this.shouldTargetA ? this.tempRG16BufferA.framebuffer :
        this.tempRG16BufferB.framebuffer);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.shouldTargetA ? this.tempRG16BufferB.texture : this.tempRG16BufferA.texture);
      const Viscosity = 0.1; // 粘性係数
      const timeStep = 1;
      const centerFactor = 1.0 / (Viscosity * timeStep);
      const beta = (Viscosity * timeStep) / (1.0 + 4.0 * Viscosity * timeStep);
      gl.uniform1i(this.uniformLocations[program].initialTexture, 0);
      gl.uniform1i(this.uniformLocations[program].bufferTexture, 1);
      gl.uniform1f(this.uniformLocations[program].centerFactor, centerFactor);
      gl.uniform1f(this.uniformLocations[program].beta, beta);
      gl.uniform2fv(this.uniformLocations[program].resolution, [this.canvas.width, this.canvas.height]);
      gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);
      this.shouldTargetA = !this.shouldTargetA;
    }
  }

  project(sourceBuffer, destBuffer) {
    const gl = this.gl;

    // --- velocity の発散をバッファーに書き出す ---


    // --- 圧力場を0に初期化 ---

    // --- Jacobi 反復計算を行う ---

    // --- 発散のない速度場を生成する ---


    let program = this.solverProgram;
    gl.useProgram(program);
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocations[program], this.attributeStride, this.planeIBO);
    gl.uniformMatrix4fv(this.uniformLocations[program].mvpMatrix, false, this.quadMvpMatrix);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceBuffer.texture);
    const itter = 10;
    for (let i = 0; i < itter; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER,
        i == (itter - 1) ? destBuffer.framebuffer :
        this.shouldTargetA ? this.tempRG16BufferA.framebuffer :
        this.tempRG16BufferB.framebuffer);
      gl.activeTexture(gl.TEXTURE1);  
      gl.bindTexture(gl.TEXTURE_2D, this.shouldTargetA ? this.tempRG16BufferB.texture : this.tempRG16BufferA.texture);
      const Viscosity = 0.0; // 粘性係数
      const timeStep = 1;
      const centerFactor = 1.0 / (Viscosity * timeStep);
      const beta = (Viscosity * timeStep) / (1.0 + 4.0 * Viscosity * timeStep);
      gl.uniform1i(this.uniformLocations[program].initialTexture, 0);
      gl.uniform1i(this.uniformLocations[program].bufferTexture, 1);
      gl.uniform1f(this.uniformLocations[program].centerFactor, centerFactor);
      gl.uniform1f(this.uniformLocations[program].beta, beta);
      gl.uniform2fv(this.uniformLocations[program].resolution, [this.canvas.width, this.canvas.height]);
      gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);
      this.shouldTargetA = !this.shouldTargetA;
    }
  }

  divergence(sourceBuffer, destBuffer) {
  }

  advect(sourceBuffer, velocityBuffer, destBuffer) {
    const gl = this.gl;
    const program = this.advectionProgram;
    gl.useProgram(program);
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocations[program], this.attributeStride, this.planeIBO);
    gl.uniformMatrix4fv(this.uniformLocations[program].mvpMatrix, false, this.quadMvpMatrix);


  /**
   * レンダリングを行う
   */
  render() {
    requestAnimationFrame(this.render);
    const gl = this.gl;
    // const currentTime = performance.now() * 0.001 * this.timeScale;

    // --- velocity ---
    this.diffuse(this.velocityBuffer, this.velocityBufferTemp);
    this.project(this.velocityBufferTemp, this.velocityBuffer);
    this.advect(this.velocityBuffer, this.velocityBuffer);
    this.project(this.velocityBuffer);

    // --- dye ---
    this.diffuse(this.dyeBuffer);
    this.advect(this.dyeBuffer, this.velocityBuffer);
    this.visualize(this.dyeBuffer);


    // ---------- Jacobi 反復計算を行う -------------
    gl.useProgram(this.solverProgram);
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocations[0], this.attributeStride, this.planeIBO);

    // 初期状態のテクスチャをバインド
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.initialized ? this.bufferC.texture : this.initialBuffer);

    for (let i = 0; i < 30; i++) {
      this.setupRendering();
      gl.uniformMatrix4fv(this.uniformLocations[0].mvpMatrix, false, this.calcMvp());

      // レンダーターゲット
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shouldTargetA ? this.bufferA.framebuffer : this.bufferB.framebuffer);
      
      // 入力テクスチャ
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D,
        !this.initialized ? this.initialBuffer 
        : this.shouldTargetA ? this.bufferB.texture 
        : this.bufferA.texture);
      if (!this.initialized) this.initialized = true;

      const Viscosity = 0.1; // 粘性係数
      const timeStep = 1;
      const centerFactor = 1.0 / (Viscosity * timeStep);
      const beta = (Viscosity * timeStep) / (1.0 + 4.0 * Viscosity * timeStep);

      gl.uniform1i(this.uniformLocations[0].initialTexture, 0);
      gl.uniform1i(this.uniformLocations[0].bufferTexture, 1);
      gl.uniform1f(this.uniformLocations[0].centerFactor, centerFactor);
      gl.uniform1f(this.uniformLocations[0].beta, beta);
      gl.uniform2fv(this.uniformLocations[0].resolution, [this.canvas.width, this.canvas.height]);
      gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);
      this.shouldTargetA = !this.shouldTargetA;
    }

    // ------------ 次フレーム用に複製 ------------
    gl.useProgram(this.blitProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bufferC.framebuffer);
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocations[1], this.attributeStride, this.planeIBO);
    this.setupRendering();
    gl.uniformMatrix4fv(this.uniformLocations[1].mvpMatrix, false, this.calcMvp());
    gl.uniform2fv(this.uniformLocations[1].resolution, [this.canvas.width, this.canvas.height]);
    gl.uniform1i(this.uniformLocations[1].bufferTexture, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shouldTargetA ? this.bufferB.texture : this.bufferA.texture);
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

    // -------------- 画面に描画 -------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.setupRendering();
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);


    return;


    // this.setupRendering();

    // test
    // gl.useProgram(this.program);

    // gl.uniformMatrix4fv(this.uniformLocation.mvpMatrix, false, this.calcMvp());
    // // gl.uniformMatrix4fv(this.uniformLocation.mMatrix, false, m);
    // // gl.uniformMatrix4fv(this.uniformLocation.normalMatrix, false, normalMatrix);


    // // gl.activeTexture(gl.TEXTURE0);
    // // gl.bindTexture(gl.TEXTURE_2D, this.textures[0]);
    // // gl.activeTexture(gl.TEXTURE1);
    // // gl.bindTexture(gl.TEXTURE_2D, this.textures[1]);

    // // gl.uniform1i(this.uniformLocation.textureUnit0, 0); // テクスチャユニットの番号を送る @@@
    // // gl.uniform1i(this.uniformLocation.textureUnit1, 1);
    // // gl.uniform3fv(this.uniformLocation.eyePos, this.camera.position);
    // gl.uniform1f(this.uniformLocation.time, currentTime);
    // gl.uniform2fv(this.uniformLocation.resolution, [this.canvas.width, this.canvas.height]);

    // // VBO と IBO を設定し、描画する
    // WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);
    // gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);
  }
}
