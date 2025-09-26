import { WebGLUtility } from '../lib/webgl.js';
import { Mat4, Vec3 } from '../lib/math.js';
import { WebGLGeometry } from '../lib/geometry.js';
import { WebGLOrbitCamera } from '../lib/camera.js';
import { Pane } from '../lib/tweakpane-4.0.3.min.js';

window.addEventListener('DOMContentLoaded', async () => {
  const app = new App();
  app.init();
  // app.setupPane(); // tweakpane の初期化をメソッド化 @@@
  await app.load();
  app.setupGeometry();
  app.setupLocation();
  app.start();
}, false);

/**
 * アプリケーション管理クラス
 */
class App {
  canvas;            // WebGL で描画を行う canvas 要素
  gl;                // WebGLRenderingContext （WebGL コンテキスト）
  camera;

  // --- program ---
  program;           // WebGLProgram （プログラムオブジェクト）
  solverProgram;  // ジャコビ反復計算用のプログラムオブジェクト
  advectionProgram; // アドベクション用のプログラムオブジェクト
  perlinProgram; // パーリンノイズ用のプログラムオブジェクト
  blitProgram;    // フレームバッファの内容を画面に描画するためのプログラムオブジェクト
  divergentProgram; // 発散計算用のプログラムオブジェクト
  getDivFreeProgram; // 非発散ベクトル場計算用のプログラムオブジェクト

  // --- attribute, uniform ---
  attributeLocation; // attribute 変数のロケーション
  attributeStride;   // attribute 変数のストライド
  uniformLocations = [];   // uniform 変数のロケーション
  planeGeometry;     // 板ポリゴンのジオメトリ情報
  planeVBO;          // 板ポリゴンの頂点バッファ
  planeIBO;          // 板ポリゴンのインデックスバッファ
  startTime;         // レンダリング開始時のタイムスタンプ
  shouldTargetA;      // 現在の描画ターゲットが bufferA にするかどうかのフラグ
  initialized = false; // 初期状態をセットしたかどうかのフラグ
  startingTexture; // dyeの初期状態
  quadMvpMatrix; // 板ポリゴン描画用の MVP 行列

  // --- frame buffer ---
  velocityBuffer; // 速度場 (RG16) (一旦RGBA32)
  velocityBufferTemp; // 速度場一時バッファ (RG16) (一旦RGBA32)
  velocityDivergenceBuffer; // 速度場の発散を格納するバッファ
  dyeBuffer;      // 染料場 (R8)   (一旦RGBA32)
  dyeBufferTemp;  // 染料場一時バッファ (R8) (一旦RGBA32)
  tempBufferA;   // ping-pong一時バッファA (一旦RGBA32)
  tempBufferB;   // ping-pong一時バッファB (一旦RGBA32)

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

    this.camera = new WebGLOrbitCamera(this.canvas, cameraOption);

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

        const solverFSource = await WebGLUtility.loadFile('./jacobi_solver.frag');
        const solverVShader = WebGLUtility.createShaderObject(gl, VSSource, gl.VERTEX_SHADER);
        const solverFShader = WebGLUtility.createShaderObject(gl, solverFSource, gl.FRAGMENT_SHADER);
        this.solverProgram = WebGLUtility.createProgramObject(gl, solverVShader, solverFShader);

        const advectionFSource = await WebGLUtility.loadFile('./advect.frag');
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

        const divergentFSource = await WebGLUtility.loadFile('./divergent.frag');
        const divergentVShader = WebGLUtility.createShaderObject(gl, VSSource, gl.VERTEX_SHADER);
        const divergentFShader = WebGLUtility.createShaderObject(gl, divergentFSource, gl.FRAGMENT_SHADER);
        this.divergentProgram = WebGLUtility.createProgramObject(gl, divergentVShader, divergentFShader);

        const getDivFreeFSource = await WebGLUtility.loadFile('./get_div_free.frag');
        const getDivFreeVShader = WebGLUtility.createShaderObject(gl, VSSource, gl.VERTEX_SHADER);
        const getDivFreeFShader = WebGLUtility.createShaderObject(gl, getDivFreeFSource, gl.FRAGMENT_SHADER);
        this.getDivFreeProgram = WebGLUtility.createProgramObject(gl, getDivFreeVShader, getDivFreeFShader);

        // フレームバッファを生成する @@@
        // リサイズが完了してからフレームバッファを作成
        this.resize(); // サイズを再設定
        this.velocityBuffer = WebGLUtility.createFramebuffer(gl, this.canvas.width, this.canvas.height);
        this.velocityBufferTemp = WebGLUtility.createFramebuffer(gl, this.canvas.width, this.canvas.height);
        this.velocityDivergenceBuffer = WebGLUtility.createFramebuffer(gl, this.canvas.width, this.canvas.height);
        this.dyeBuffer = WebGLUtility.createFramebuffer(gl, this.canvas.width, this.canvas.height);
        this.dyeBufferTemp = WebGLUtility.createFramebuffer(gl, this.canvas.width, this.canvas.height);
        this.tempBufferA = WebGLUtility.createFramebuffer(gl, this.canvas.width, this.canvas.height);
        this.tempBufferB = WebGLUtility.createFramebuffer(gl, this.canvas.width, this.canvas.height);
        this.shouldTargetA = true;

        await WebGLUtility.loadImage('../textures/earth.jpg').then((image) => {
          this.startingTexture = WebGLUtility.createTexture(gl, image);
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

  getProgramId(program) {
    if (program === this.program) return 'program';
    if (program === this.solverProgram) return 'solver';
    if (program === this.blitProgram) return 'blit';
    if (program === this.perlinProgram) return 'perlin';
    if (program === this.advectionProgram) return 'advection';
    if (program === this.divergentProgram) return 'divergent';
    return null;
  }

  /**
   * 頂点属性のロケーションに関するセットアップを行う
   */
  setupLocation() {
    const gl = this.gl;
    // --- attribute ---
    // attribute location の取得
    this.attributeLocation = [0, 1, 2, 3];

    // attribute のストライド
    this.attributeStride = [3, 3, 4, 2]; // ストライドは２ @@@

    // --- uniform ---
    // uniform location の取得
    for (let program of [this.program, this.solverProgram, this.blitProgram, this.perlinProgram, this.advectionProgram, this.divergentProgram, this.getDivFreeProgram]) {
      this.uniformLocations[this.getProgramId(program)] = {
        time: gl.getUniformLocation(program, 'u_time'),
        resolution: gl.getUniformLocation(program, 'u_resolution'),
        mvpMatrix: gl.getUniformLocation(program, 'mvpMatrix')
      };
    }

    Object.assign(this.uniformLocations[this.getProgramId(this.program)], {
      bufferTexture: gl.getUniformLocation(this.program, 'u_bufferTexture'),
    });
    Object.assign(this.uniformLocations[this.getProgramId(this.solverProgram)], {
      bufferTexture: gl.getUniformLocation(this.solverProgram, 'u_bufferTexture'),
      centerFactor: gl.getUniformLocation(this.solverProgram, 'u_centerFactor'),
      beta: gl.getUniformLocation(this.solverProgram, 'u_beta'),
      initialTexture: gl.getUniformLocation(this.solverProgram, 'u_initialTexture'),
      scale: gl.getUniformLocation(this.solverProgram, 'u_scale'),
      offset: gl.getUniformLocation(this.solverProgram, 'u_offset'),
    });
    Object.assign(this.uniformLocations[this.getProgramId(this.blitProgram)], {
      bufferTexture: gl.getUniformLocation(this.blitProgram, 'u_bufferTexture'),
    });
    Object.assign(this.uniformLocations[this.getProgramId(this.advectionProgram)], {
      velocityTexture: gl.getUniformLocation(this.advectionProgram, 'u_velocityTexture'),
      textureToAdvect: gl.getUniformLocation(this.advectionProgram, 'u_textureToAdvect'),
      dissipation: gl.getUniformLocation(this.advectionProgram, 'u_dissipationFactor'),
      deltaTime: gl.getUniformLocation(this.advectionProgram, 'u_deltaTime'),
    });
    Object.assign(this.uniformLocations[this.getProgramId(this.divergentProgram)], {
      bufferTexture: gl.getUniformLocation(this.divergentProgram, 'u_bufferTexture')
    });
    Object.assign(this.uniformLocations[this.getProgramId(this.getDivFreeProgram)], {
      pressureTexture: gl.getUniformLocation(this.getDivFreeProgram, 'u_pressureTexture'),
      velocityTexture: gl.getUniformLocation(this.getDivFreeProgram, 'u_velocityTexture'),
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

    // MVP行列の計算
    this.quadMvpMatrix = this.calcMvp();
  }

  /**
   * 描画を開始する
   */
  start() {
    // レンダリング開始時のタイムスタンプを取得しておく
    this.startTime = Date.now();
    // レンダリングを行っているフラグを立てておく
    this.isRendering = true;
    // 初期状態バッファを生成
    this.initializeBuffer();
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
    const v = this.camera.update();
    const m = Mat4.identity();
    // const v = Mat4.lookAt(Vec3.create(0, 0, -1), Vec3.create(0, 0, 0), Vec3.create(0, 1, 0));
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

  clearBuffer(buffer) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer.framebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  unbindTextures() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  bindBasicUniforms(program) {
    const gl = this.gl;
    const programId = this.getProgramId(program);
    gl.uniformMatrix4fv(this.uniformLocations[programId].mvpMatrix, false, this.quadMvpMatrix);
    gl.uniform2fv(this.uniformLocations[programId].resolution, [this.canvas.width, this.canvas.height]);
    gl.uniform1f(this.uniformLocations[programId].time, performance.now() * 0.001);
  }

  initializeBuffer() {
    if( this.initialized ) return;

    const gl = this.gl;
    {
      // velocityBuffer の初期化
      // 1. Use Program
      const program = this.perlinProgram;
      gl.useProgram(program);

      // 2. Bind Textures
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityBuffer.framebuffer);
      this.setupRendering();

      // 3. Bind Uniforms
      this.bindBasicUniforms(program);

      // 4. Bind Attributes
      WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);
      
      // 5. Draw
      gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

      // 6. Unbind
      this.unbindTextures();
    }

    {
      // dyeBuffer の初期化
      // 1. Use Program
      const program = this.blitProgram;
      const programId = this.getProgramId(program);
      gl.useProgram(program);

      // 2. Bind Textures
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.dyeBuffer.framebuffer);
      this.setupRendering();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.startingTexture);

      // 3. Bind Uniforms
      this.bindBasicUniforms(program);
      gl.uniform1i(this.uniformLocations[programId].bufferTexture, 0);

      // 4. Bind Attributes
      WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

      // 5. Draw
      gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

      // 6. Unbind
      this.unbindTextures();
    }
  
    
    this.initialized = true;
  }

  blit(sourceBuffer, destBuffer) {
    const gl = this.gl;

    // 1. Use Program
    let program = this.blitProgram;
    let programId = this.getProgramId(program);
    gl.useProgram(program);

    // 2. Bind Textures
    gl.bindFramebuffer(gl.FRAMEBUFFER, destBuffer.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceBuffer.texture);

    // 3. Bind Uniforms
    this.bindBasicUniforms(program);
    gl.uniform1i(this.uniformLocations[programId].bufferTexture, 0);

    // 4. Bind Attributes
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

    // 5. Draw
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);
    
    // 6. Unbind
    this.unbindTextures();
  }

  diffuse(sourceBuffer, destBuffer) {
    const gl = this.gl;
    
    // 1. Use Program
    let program = this.solverProgram;
    let programId = this.getProgramId(program);
    gl.useProgram(program);

    // 2. Bind Textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceBuffer.texture);
    this.clearBuffer(this.tempBufferA);
    this.clearBuffer(this.tempBufferB);

    // 3. Bind Uniforms
    this.bindBasicUniforms(program);
    gl.uniform1i(this.uniformLocations[programId].initialTexture, 0);

    // 4. Bind Attributes
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

    const itter = 20;
    for (let i = 0; i < itter; i++) {
      // 2.5. Bind Texture for Ping-Pong
      const target = i == (itter - 1) ? destBuffer : (this.shouldTargetA ? this.tempBufferA : this.tempBufferB);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.shouldTargetA ? this.tempBufferB.texture : this.tempBufferA.texture);

      // 3.5. Update Uniforms for Ping-Pong
      const Viscosity = 0.5; // 粘性係数
      const timeStep = 1.0;
      const centerFactor = 1.0 / (Viscosity * timeStep);
      const beta = (Viscosity * timeStep) / (1.0 + 4.0 * Viscosity * timeStep);
      gl.uniform1i(this.uniformLocations[programId].bufferTexture, 1);
      gl.uniform1f(this.uniformLocations[programId].centerFactor, centerFactor);
      gl.uniform1f(this.uniformLocations[programId].beta, beta);
      gl.uniform1f(this.uniformLocations[programId].scale, 2.0);
      gl.uniform1f(this.uniformLocations[programId].offset, 1.0);

      // 5. Draw
      gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

      this.shouldTargetA = !this.shouldTargetA;
    }
    
    // 6. Unbind
    this.unbindTextures();
  }

  project(sourceBuffer, destBuffer) {
    const gl = this.gl;

    // --- velocity の発散をバッファーに書き出す ---
    this.divergence(sourceBuffer, this.velocityDivergenceBuffer);

    // --- 圧力場用tempBufferを0に初期化 ---
    this.clearBuffer(this.tempBufferA);
    this.clearBuffer(this.tempBufferB);

    // --- Jacobi 反復計算を行う ---
    // 1. Use Program
    let program = this.solverProgram;
    let programId = this.getProgramId(program);
    gl.useProgram(program);

    // 2. Bind Textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocityDivergenceBuffer.texture);

    // 3. Bind Uniforms
    this.bindBasicUniforms(program);
    const centerFactor = -1.0;
    const beta = 0.25;
    gl.uniform1f(this.uniformLocations[programId].centerFactor, centerFactor);
    gl.uniform1f(this.uniformLocations[programId].beta, beta);
    gl.uniform1i(this.uniformLocations[programId].initialTexture, 0);
    gl.uniform1f(this.uniformLocations[programId].scale, 1.0);
    gl.uniform1f(this.uniformLocations[programId].offset, 0.0);

    // 4. Bind Attributes
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

    const itter = 10;
    for (let i = 0; i < itter; i++) {
      // 2.5. Bind Texture for Ping-Pong
      this.shouldTargetA = !this.shouldTargetA;
      const target = this.shouldTargetA ? this.tempBufferA : this.tempBufferB;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.shouldTargetA ? this.tempBufferB.texture : this.tempBufferA.texture);

      // 5. Draw
      gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);
    }
    
    // 6. Unbind
    this.unbindTextures();
      
    // --- 発散のない速度場を求める ---
    this.getDivFreeVelocity(this.shouldTargetA ? this.tempBufferA : this.tempBufferB, sourceBuffer, destBuffer);
  }

  divergence(sourceBuffer, destBuffer) {
    const gl = this.gl;

    // 1. Use Program
    let program = this.divergentProgram;
    let programId = this.getProgramId(program);
    gl.useProgram(program);

    // 2. Bind Textures
    gl.bindFramebuffer(gl.FRAMEBUFFER, destBuffer.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceBuffer.texture);

    // 3. Bind Uniforms
    this.bindBasicUniforms(program);
    gl.uniform1i(this.uniformLocations[programId].bufferTexture, 0);

    // 4. Bind Attributes
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

    // 5. Draw
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

    // 6. Unbind Textures
    this.unbindTextures();
  }

  getDivFreeVelocity(pressureBuffer, velocityBuffer, destBuffer){
    const gl = this.gl;

    // 1. Use Program
    let program = this.getDivFreeProgram;
    let programId = this.getProgramId(program);
    gl.useProgram(program);

    // 2. Bind Textures
    gl.bindFramebuffer(gl.FRAMEBUFFER, destBuffer.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pressureBuffer.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, velocityBuffer.texture);

    // 3. Bind Uniforms
    this.bindBasicUniforms(program);
    gl.uniform1i(this.uniformLocations[programId].pressureTexture, 0);
    gl.uniform1i(this.uniformLocations[programId].velocityTexture, 1);

    // 4. Bind Attributes
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

    // 5. Draw
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

    // 6. Unbind Textures
    this.unbindTextures();
  }

  advect(textureToAdvect, velocityBuffer, destBuffer) {
    const gl = this.gl;

    // 1. Use Program
    const program = this.advectionProgram;
    const programId = this.getProgramId(program);
    gl.useProgram(program);

    // 2. Bind Textures
    gl.bindFramebuffer(gl.FRAMEBUFFER, destBuffer.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureToAdvect.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, velocityBuffer.texture);

    // 3. Bind Uniforms
    this.bindBasicUniforms(program);
    gl.uniform1f(this.uniformLocations[programId].dissipation, 0.99);
    gl.uniform1f(this.uniformLocations[programId].deltaTime, 1.0);
    gl.uniform1i(this.uniformLocations[programId].textureToAdvect, 0);
    gl.uniform1i(this.uniformLocations[programId].velocityTexture, 1);

    // 4. Bind Attributes
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

    // 5. Draw
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

    // 6. Unbind
    this.unbindTextures();
  }

  visualize(buffer) {
    const gl = this.gl;

    // 1. Use Program
    const program = this.blitProgram;
    const programId = this.getProgramId(program);
    gl.useProgram(program);

    // 2. Bind Textures
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, buffer.texture);

    // 3. Bind Uniforms
    this.bindBasicUniforms(program);
    gl.uniform1i(this.uniformLocations[programId].bufferTexture, 0);

    // 4. Bind Attribute
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

    // 5. Draw
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

    // 6. Unbind
    this.unbindTextures();
  }

  recreateFramebuffer(buffer) {
    const gl = this.gl;
    WebGLUtility.deleteFramebuffer(gl, buffer.framebuffer, buffer.depthRenderBuffer, buffer.texture);
    return WebGLUtility.createFramebuffer(gl, this.canvas.width, this.canvas.height);
  }

  /**
   * レンダリングを行う
   */
  render() {
    requestAnimationFrame(this.render);
    this.setupRendering();

    // --- velocity ---
    this.diffuse(this.velocityBuffer, this.velocityBufferTemp);
    this.project(this.velocityBufferTemp, this.velocityBuffer);
    this.advect(this.velocityBuffer, this.velocityBuffer, this.velocityBufferTemp);
    this.project(this.velocityBufferTemp, this.velocityBuffer);

    // --- dye ---
    this.diffuse(this.dyeBuffer, this.dyeBufferTemp);
    this.advect(this.dyeBufferTemp, this.velocityBuffer, this.dyeBuffer);
    // this.visualize(this.dyeBuffer);
    this.visualize(this.velocityBuffer);
  }
}
