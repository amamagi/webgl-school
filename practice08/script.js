import { WebGLUtility } from '../lib/webgl.js';
import { Mat4, Vec2, Vec3 } from '../lib/math.js';
import { WebGLGeometry } from '../lib/geometry.js';
// import { WebGLOrbitCamera } from '../lib/camera.js';
import { Pane } from '../lib/tweakpane-4.0.3.min.js';

window.addEventListener('DOMContentLoaded', async () => {
  const app = new App();
  app.init();
  app.setupPane(); // tweakpane の初期化をメソッド化 @@@
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
  boundaryProgram; // 境界条件処理用のプログラムオブジェクト
  addVelocityProgram; // 速度場に外力を加えるプログラムオブジェクト
  addDyeProgram; // 染料場に外力を加えるプログラムオブジェクト
  refractProgram; // 屈折表示用のプログラムオブジェクト

  // --- attribute, uniform ---
  attributeLocation; // attribute 変数のロケーション
  attributeStride;   // attribute 変数のストライド
  uniformLocations = [];   // uniform 変数のロケーション
  planeGeometry;     // 板ポリゴンのジオメトリ情報
  planeVBO;          // 板ポリゴンの頂点バッファ
  planeIBO;          // 板ポリゴンのインデックスバッファ
  quadMvpMatrix; // 板ポリゴン描画用の MVP 行列
  startingTexture; // dyeの初期状態

  // --- frame buffer ---
  velocityBuffer; // 速度場 (RG16) (一旦RGBA32)
  velocityBufferTemp; // 速度場一時バッファ (RG16) (一旦RGBA32)
  velocityDivergenceBuffer; // 速度場の発散を格納するバッファ
  dyeBuffer;      // 染料場 (R8)   (一旦RGBA32)
  dyeBufferTemp;  // 染料場一時バッファ (R8) (一旦RGBA32)
  tempBufferA;   // ping-pong一時バッファA (一旦RGBA32)
  tempBufferB;   // ping-pong一時バッファB (一旦RGBA32)

  // --- その他 ---
  startTime;         // レンダリング開始時のタイムスタンプ
  shouldTargetA;      // 現在の描画ターゲットが bufferA にするかどうかのフラグ
  mouseMoveEvent;     // マウス移動イベント
  preveMouseMoveEvent; // 1フレーム前のマウス移動イベント
  isMouseDown;     // マウスが押されているかどうかのフラグ
  enableLighting = false;    // ライティングを有効にするかどうかのフラグ
  showVelocity = true;   // 速度場を可視化するかどうかのフラグ
  timeScale = 100;
  deltaTime = 0.01;
  lastFrameTime = 0.0;

  // 統合された入力管理用プロパティ
  inputEvent;       // 現在の入力位置（マウスまたはタッチ）
  prevInputEvent;   // 1フレーム前の入力位置
  isInputActive;    // 入力が有効かどうかのフラグ（マウス押下またはタッチ中）

  constructor() {
    // this を固定するためのバインド処理
    this.resize = this.resize.bind(this);
    this.render = this.render.bind(this);
    // 統合された入力イベントハンドラーをバインド
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
    this.preventDefaultTouch = this.preventDefaultTouch.bind(this); // 追加
  }

  /**
   * 初期化処理を行う
   */
  init() {
    // canvas エレメントの取得と WebGL コンテキストの初期化
    this.canvas = document.getElementById('webgl-canvas');
    this.gl = this.canvas.getContext('webgl2');

    // Check WebGL2 support (float textures are natively supported in WebGL2)
    if (!this.gl) {
      throw new Error('WebGL2 not supported - this demo requires WebGL2 for native float texture support');
    }
    console.log('WebGL2 detected - float textures natively supported');

    // Check for EXT_color_buffer_float extension
    const ext = this.gl.getExtension('EXT_color_buffer_float');
    if (!ext) {
        console.error('EXT_color_buffer_float not supported');
    }

    // カメラ制御用インスタンスを生成する
    const cameraOption = {
      distance: 5.0, // Z 軸上の初期位置までの距離
      min: 1.0,      // カメラが寄れる最小距離
      max: 10.0,     // カメラが離れられる最大距離
      move: 2.0,     // 右ボタンで平行移動する際の速度係数
    };

    // this.camera = new WebGLOrbitCamera(this.canvas, cameraOption);

    // 最初に一度リサイズ処理を行っておく
    this.resize();

    // リサイズイベントの設定
    window.addEventListener('resize', () => {
    this.resize();
    this.initializeBuffer();
  }, false);
    
    // 深度テストは初期状態で有効
    this.gl.enable(this.gl.DEPTH_TEST);

    this.quadMvpMatrix = this.calcMvp();

    // マウスイベントの設定
    // 統合された入力イベントの設定
    // マウスイベント
    this.canvas.addEventListener('mousemove', this.handleMouseMove, false);
    this.canvas.addEventListener('mousedown', this.handleMouseDown, false);
    this.canvas.addEventListener('mouseup', this.handleMouseUp, false);
    this.canvas.addEventListener('mouseleave', this.handleMouseUp, false);

    // タッチイベント
    this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    this.canvas.addEventListener('touchcancel', this.handleTouchEnd, { passive: false });

    // キャンバス全体でのスクロール防止
    this.canvas.style.touchAction = 'none';

    // ドキュメント全体でのタッチイベント制御
    document.addEventListener('touchstart', this.preventDefaultTouch, { passive: false });
    document.addEventListener('touchmove', this.preventDefaultTouch, { passive: false });
  }

  /**
   * タッチイベントのデフォルト動作を防ぐ（修正版）
   */
  preventDefaultTouch(e) {
    // キャンバス要素上でのタッチのみを対象とする
    if (e.target === this.canvas) {
      e.preventDefault();
    }
  }

  /**
   * 座標を正規化する共通関数
   */
  normalizeCoordinates(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = 1.0 - (clientY - rect.top) / rect.height;
    return { x, y };
  }

  /**
   * マウス移動処理
   */
  handleMouseMove(e) {
    if (!this.isInputActive) return;
    this.inputEvent = this.normalizeCoordinates(e.clientX, e.clientY);
  }

  /**
   * マウス押下処理
   */
  handleMouseDown(e) {
    this.isInputActive = true;
    this.inputEvent = this.normalizeCoordinates(e.clientX, e.clientY);
    this.prevInputEvent = null; // 初回は前の位置をリセット
  }

  /**
   * マウス離上処理
   */
  handleMouseUp(e) {
    this.isInputActive = false;
    this.inputEvent = null;
    this.prevInputEvent = null;
  }

  /**
   * タッチ開始処理（修正版）
   */
  handleTouchStart(e) {
    e.preventDefault();
    e.stopPropagation();
    
    this.isInputActive = true;
    
    const touch = e.touches[0];
    this.inputEvent = this.normalizeCoordinates(touch.clientX, touch.clientY);
    this.prevInputEvent = null;
  }

  /**
   * タッチ移動処理
   */
  handleTouchMove(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!this.isInputActive) return;
    
    const touch = e.touches[0];
    this.inputEvent = this.normalizeCoordinates(touch.clientX, touch.clientY);
  }

  /**
   * タッチ終了処理（修正版）
   */
  handleTouchEnd(e) {
    e.preventDefault();
    e.stopPropagation();
    
    this.isInputActive = false;
    this.inputEvent = null;
    this.prevInputEvent = null;
  }

  /**
   * tweakpane の初期化処理
   */
  setupPane() {
    // Tweakpane を使った GUI の設定
    const pane = new Pane();
    const parameter = {
      // lighting: this.enableLighting,
      // showVelocity: this.showVelocity
    };
    // テクスチャの初期化
    pane.addButton({ title: 'Reset' }).on('click', () => {
      this.initializeBuffer();
    });
    // ライティングのON/OFF
    // pane.addBinding(parameter, 'lighting').on('change', (v) => {
    //   this.enableLighting = v.value;
    // });
    // 速度場の可視化ON/OFF
    // pane.addBinding(parameter, 'showVelocity').on('change', (v) => {
    //   this.showVelocity = v.value;
    // });

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

        const boundaryFSource = await WebGLUtility.loadFile('./boundary.frag');
        const boundaryVShader = WebGLUtility.createShaderObject(gl, VSSource, gl.VERTEX_SHADER);
        const boundaryFShader = WebGLUtility.createShaderObject(gl, boundaryFSource, gl.FRAGMENT_SHADER);
        this.boundaryProgram = WebGLUtility.createProgramObject(gl, boundaryVShader, boundaryFShader);

        const addVelocityFSource = await WebGLUtility.loadFile('./addVelocity.frag');
        const addVelocityVShader = WebGLUtility.createShaderObject(gl, VSSource, gl.VERTEX_SHADER);
        const addVelocityFShader = WebGLUtility.createShaderObject(gl, addVelocityFSource, gl.FRAGMENT_SHADER);
        this.addVelocityProgram = WebGLUtility.createProgramObject(gl, addVelocityVShader, addVelocityFShader);

        const addDyeFSource = await WebGLUtility.loadFile('./addDye.frag');
        const addDyeVShader = WebGLUtility.createShaderObject(gl, VSSource, gl.VERTEX_SHADER);
        const addDyeFShader = WebGLUtility.createShaderObject(gl, addDyeFSource, gl.FRAGMENT_SHADER);
        this.addDyeProgram = WebGLUtility.createProgramObject(gl, addDyeVShader, addDyeFShader);

        const refractFSource = await WebGLUtility.loadFile('./refract.frag');
        const refractVShader = WebGLUtility.createShaderObject(gl, VSSource, gl.VERTEX_SHADER);
        const refractFShader = WebGLUtility.createShaderObject(gl, refractFSource, gl.FRAGMENT_SHADER);
        this.refractProgram = WebGLUtility.createProgramObject(gl, refractVShader, refractFShader);

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
    if (program === this.getDivFreeProgram) return 'getDivFree';
    if (program === this.boundaryProgram) return 'boundary';
    if (program === this.addVelocityProgram) return 'addVelocity';
    if (program === this.addDyeProgram) return 'addDye';
    if (program === this.refractProgram) return 'refract';
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
    for (let program of [this.program, this.perlinProgram, this.advectionProgram, this.solverProgram, this.blitProgram, 
      this.divergentProgram, this.getDivFreeProgram, this.boundaryProgram, this.addVelocityProgram, this.addDyeProgram, this.refractProgram]) {
      this.uniformLocations[this.getProgramId(program)] = {
        time: gl.getUniformLocation(program, 'u_time'),
        resolution: gl.getUniformLocation(program, 'u_resolution'),
        mvpMatrix: gl.getUniformLocation(program, 'mvpMatrix')
      };
    }

    Object.assign(this.uniformLocations[this.getProgramId(this.program)], {
      floatTexture: gl.getUniformLocation(this.program, 'u_floatTexture'),
      visualizationMode: gl.getUniformLocation(this.program, 'u_visualizationMode'),
      minValue: gl.getUniformLocation(this.program, 'u_minValue'),
      maxValue: gl.getUniformLocation(this.program, 'u_maxValue'),
    });
    Object.assign(this.uniformLocations[this.getProgramId(this.solverProgram)], {
      initialTexture: gl.getUniformLocation(this.solverProgram, 'u_initialTexture'),
      bufferTexture: gl.getUniformLocation(this.solverProgram, 'u_bufferTexture'),
      centerFactor: gl.getUniformLocation(this.solverProgram, 'u_centerFactor'),
      beta: gl.getUniformLocation(this.solverProgram, 'u_beta'),
    });
    Object.assign(this.uniformLocations[this.getProgramId(this.blitProgram)], {
      bufferTexture: gl.getUniformLocation(this.blitProgram, 'u_bufferTexture'),
      invertY: gl.getUniformLocation(this.blitProgram, 'u_invertY'),
      grayScale: gl.getUniformLocation(this.blitProgram, 'u_grayScale'),
    });
    Object.assign(this.uniformLocations[this.getProgramId(this.advectionProgram)], {
      velocityTexture: gl.getUniformLocation(this.advectionProgram, 'u_velocityTexture'),
      textureToAdvect: gl.getUniformLocation(this.advectionProgram, 'u_textureToAdvect'),
      dissipation: gl.getUniformLocation(this.advectionProgram, 'u_dissipationFactor'),
      deltaTime: gl.getUniformLocation(this.advectionProgram, 'u_deltaTime'),
    });
    Object.assign(this.uniformLocations[this.getProgramId(this.divergentProgram)], {
      bufferTexture: gl.getUniformLocation(this.divergentProgram, 'u_bufferTexture'),
    });
    Object.assign(this.uniformLocations[this.getProgramId(this.getDivFreeProgram)], {
      pressureTexture: gl.getUniformLocation(this.getDivFreeProgram, 'u_pressureTexture'),
      velocityTexture: gl.getUniformLocation(this.getDivFreeProgram, 'u_velocityTexture')
    });
    Object.assign(this.uniformLocations[this.getProgramId(this.boundaryProgram)], {
      bufferTexture: gl.getUniformLocation(this.boundaryProgram, 'u_bufferTexture'),
      dimension: gl.getUniformLocation(this.boundaryProgram, 'u_dimension'),
      boundaryEffects: gl.getUniformLocation(this.boundaryProgram, 'u_boundaryEffects')
    });
    Object.assign(this.uniformLocations[this.getProgramId(this.addVelocityProgram)], {
      bufferTexture: gl.getUniformLocation(this.addVelocityProgram, 'u_bufferTexture'),
      previousMouse: gl.getUniformLocation(this.addVelocityProgram, 'u_previousMouse'),
      currentMouse: gl.getUniformLocation(this.addVelocityProgram, 'u_currentMouse'),
      effectRadius: gl.getUniformLocation(this.addVelocityProgram, 'u_effectRadius'),
      effectScale: gl.getUniformLocation(this.addVelocityProgram, 'u_effectScale'),
    });
    Object.assign(this.uniformLocations[this.getProgramId(this.addDyeProgram)], {
      bufferTexture: gl.getUniformLocation(this.addDyeProgram, 'u_bufferTexture'),
      previousMouse: gl.getUniformLocation(this.addDyeProgram, 'u_previousMouse'),
      currentMouse: gl.getUniformLocation(this.addDyeProgram, 'u_currentMouse'),
      effectRadius: gl.getUniformLocation(this.addDyeProgram, 'u_effectRadius'),
      effectScale: gl.getUniformLocation(this.addDyeProgram, 'u_effectScale'),
    });
    Object.assign(this.uniformLocations[this.getProgramId(this.refractProgram)], {
      velocityTexture: gl.getUniformLocation(this.refractProgram, 'u_velocityTexture'),
      colorTexture: gl.getUniformLocation(this.refractProgram, 'u_colorTexture'),
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
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    // gl.clearDepth(1.0);

    // 色と深度をクリアする
    gl.clear(gl.COLOR_BUFFER_BIT);

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
    // const v = this.camera.update();
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

  clearBuffer(buffer, clearColor=[0,0,0,0]) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer.framebuffer);
    gl.clearColor(...clearColor);
    gl.clear(gl.COLOR_BUFFER_BIT);
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

  deleteFramebuffer(buffer) {
    const gl = this.gl;
    WebGLUtility.deleteFramebuffer(gl, buffer.framebuffer, buffer.depthRenderBuffer, buffer.texture);
  }

  initializeBuffer() {
    const gl = this.gl;
    
    // フレームバッファを生成する
    if (this.velocityBuffer) {
      // 既にフレームバッファが存在する場合は削除してから再作成
      this.deleteFramebuffer(this.velocityBuffer);
      this.deleteFramebuffer(this.velocityBufferTemp);
      this.deleteFramebuffer(this.velocityDivergenceBuffer);
      this.deleteFramebuffer(this.dyeBuffer);
      this.deleteFramebuffer(this.dyeBufferTemp);
      this.deleteFramebuffer(this.tempBufferA);
      this.deleteFramebuffer(this.tempBufferB);
    } 

    this.velocityBuffer = WebGLUtility.createFloatFramebuffer(gl, this.canvas.width, this.canvas.height, 4);
    this.velocityBufferTemp = WebGLUtility.createFloatFramebuffer(gl, this.canvas.width, this.canvas.height, 2);
    this.velocityDivergenceBuffer = WebGLUtility.createFloatFramebuffer(gl, this.canvas.width, this.canvas.height, 1);
    this.dyeBuffer = WebGLUtility.createFloatFramebuffer(gl, this.canvas.width, this.canvas.height, 1);
    this.dyeBufferTemp = WebGLUtility.createFloatFramebuffer(gl, this.canvas.width, this.canvas.height, 1);
    this.tempBufferA = WebGLUtility.createFloatFramebuffer(gl, this.canvas.width, this.canvas.height, 2);
    this.tempBufferB = WebGLUtility.createFloatFramebuffer(gl, this.canvas.width, this.canvas.height, 2);
    this.shouldTargetA = true;

    // 各バッファの初期状態を設定
    {
      // velocityBuffer の初期化
      // 1. Use Program
      const program = this.perlinProgram;
      gl.useProgram(program);

      // 2. Bind Textures
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityBuffer.framebuffer);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // 3. Bind Uniforms
      this.bindBasicUniforms(program);

      // 4. Bind Attributes
      WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);
      
      // 5. Draw
      gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

      // 6. Unbind
      this.unbindTextures();
    }

    this.clearBuffer(this.velocityBuffer, [0.0, 0.0, 0.0, 0.0]);
    // this.clearBuffer(this.velocityBufferTemp, [0.0, 0.0, 0.0, 0.0]);

    {
      // // dyeBuffer の初期化
      // // 1. Use Program
      // const program = this.perlinProgram;
      // const programId = this.getProgramId(program);
      // gl.useProgram(program);

      // // 2. Bind Textures
      // gl.bindFramebuffer(gl.FRAMEBUFFER, this.dyeBuffer.framebuffer);
      // gl.clear(gl.COLOR_BUFFER_BIT);
      // gl.activeTexture(gl.TEXTURE0);
      // gl.bindTexture(gl.TEXTURE_2D, this.startingTexture);

      // // 3. Bind Uniforms
      // this.bindBasicUniforms(program);
      // // gl.uniform1i(this.uniformLocations[programId].bufferTexture, 0);
      // // gl.uniform1i(this.uniformLocations[programId].invertY, 1);
      // // gl.uniform1i(this.uniformLocations[programId].grayScale, 1);

      // // 4. Bind Attributes
      // WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

      // // 5. Draw
      // gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

      // // 6. Unbind
      // this.unbindTextures();

      // this.blit(this.dyeBuffer, this.dyeBufferTemp);
    }
    
  }

  blit(sourceBuffer, destBuffer) {
    const gl = this.gl;

    // 1. Use Program
    let program = this.blitProgram;
    let programId = this.getProgramId(program);
    gl.useProgram(program);

    // 2. Bind Textures
    gl.bindFramebuffer(gl.FRAMEBUFFER, destBuffer.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceBuffer.texture);

    // 3. Bind Uniforms
    this.bindBasicUniforms(program);
    gl.uniform1i(this.uniformLocations[programId].bufferTexture, 0);
    gl.uniform1i(this.uniformLocations[programId].invertY, 0);
    gl.uniform1i(this.uniformLocations[programId].grayScale, 0);

    // 4. Bind Attributes
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

    // 5. Draw
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);
    
    // 6. Unbind
    this.unbindTextures();
  }

  diffuse(sourceBuffer, destBuffer, viscosity=0.5) {
    const gl = this.gl;

    const timeStep = this.deltaTime * this.timeScale;

    // d_X = (d0_X + viscosity * deltaTime * (d_01 + d_02+ d_03 + d_04)) / (1 + 4 * viscosity * deltaTime)
    //     = (d0_X * 1 / (vis * dT) + (d_01 + d_02+ d_03 + d_04)) * (vis * dT) / (1 + 4 * vis * dT)
    //      = (d0_X * center + (d_01 + d_02+ d_03 + d_04)) * beta
    const centerFactor = 1.0 / (viscosity * timeStep);
    const beta = (viscosity * timeStep) / (1.0 + 4.0 * viscosity * timeStep);

    this.clearBuffer(this.tempBufferA);
    this.clearBuffer(this.tempBufferB);

    // 1. Use Program
    let program = this.solverProgram;
    let programId = this.getProgramId(program);
    gl.useProgram(program);

    const itter = 30;
    for (let i = 0; i < itter; i++) {
      // 2. Bind Textures
      const target = i == (itter - 1) ? destBuffer 
                : (this.shouldTargetA ? this.tempBufferA 
                                      : this.tempBufferB);

      const prevTarget = this.shouldTargetA ? this.tempBufferB 
                                            : this.tempBufferA;

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceBuffer.texture);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, prevTarget.texture);

      // 3. Bind Uniforms
      this.bindBasicUniforms(program);
      gl.uniform1i(this.uniformLocations[programId].initialTexture, 0);
      gl.uniform1i(this.uniformLocations[programId].bufferTexture, 1);
      gl.uniform1f(this.uniformLocations[programId].centerFactor, centerFactor);
      gl.uniform1f(this.uniformLocations[programId].beta, beta);

      // 4. Bind Attributes
      WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

      // 5. Draw
      gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

      // 6. Unbind
      this.unbindTextures();

      this.shouldTargetA = !this.shouldTargetA;
    }
  }

  project(velocityBuffer, destBuffer) {
    const gl = this.gl;

    // --- velocity の発散をバッファーに書き出す ---
    this.divergence(velocityBuffer, this.velocityDivergenceBuffer);

    // --- 圧力場用tempBufferを0に初期化 ---
    this.clearBuffer(this.tempBufferA);
    this.clearBuffer(this.tempBufferB);

    // --- Jacobi 反復計算を行う ---
    // p_new[i, j] = ((p[i+1,j] + p[i,j+1] + p[i-1,j] + p[i,j-1]) - Velocity_Divergence[i,j])/4

    const itter = 30;
    let newdPressureBuffer;
    for (let i = 0; i < itter; i++) {
      // this.shouldTargetA = !this.shouldTargetA;
      // this.handleBoundary(
      //   this.shouldTargetA ? this.tempBufferB : this.tempBufferA,
      //   this.shouldTargetA ? this.tempBufferA : this.tempBufferB,
      //   1.0);
      this.shouldTargetA = !this.shouldTargetA;

      // 1. Use Program
      let program = this.solverProgram;
      let programId = this.getProgramId(program);
      gl.useProgram(program);

      // 2. Bind Textures
      // target
      newdPressureBuffer = this.shouldTargetA ? this.tempBufferA : this.tempBufferB;
      gl.bindFramebuffer(gl.FRAMEBUFFER, newdPressureBuffer.framebuffer);
      gl.clear(gl.COLOR_BUFFER_BIT);
      // source
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.velocityDivergenceBuffer.texture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.shouldTargetA ? this.tempBufferB.texture : this.tempBufferA.texture);

      // 3. Bind Uniforms
      this.bindBasicUniforms(program);
      const centerFactor = -1.0;
      const beta = 0.25;
      gl.uniform1f(this.uniformLocations[programId].centerFactor, centerFactor);
      gl.uniform1f(this.uniformLocations[programId].beta, beta);
      gl.uniform1i(this.uniformLocations[programId].initialTexture, 0);
      gl.uniform1i(this.uniformLocations[programId].bufferTexture, 1);

      // 4. Bind Attributes
      WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

      // 5. Draw
      gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);
      
      // 6. Unbind
      this.unbindTextures();
    }

    // --- 発散のない速度場を求める ---
    this.getDivFreeVelocity(newdPressureBuffer, velocityBuffer, destBuffer);
  }

  divergence(sourceBuffer, destBuffer) {
    const gl = this.gl;

    // 1. Use Program
    let program = this.divergentProgram;
    let programId = this.getProgramId(program);
    gl.useProgram(program);

    // 2. Bind Textures
    gl.bindFramebuffer(gl.FRAMEBUFFER, destBuffer.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
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

  getDivFreeVelocity(pressureBuffer, velocityBuffer, destBuffer) {
    const gl = this.gl;

    // 1. Use Program
    let program = this.getDivFreeProgram;
    let programId = this.getProgramId(program);
    gl.useProgram(program);

    // 2. Bind Textures
    gl.bindFramebuffer(gl.FRAMEBUFFER, destBuffer.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
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

  advect(textureToAdvect, velocityBuffer, destBuffer, dissipation=0.99) {
    const gl = this.gl;

    // 1. Use Program
    const program = this.advectionProgram;
    const programId = this.getProgramId(program);
    gl.useProgram(program);

    // 2. Bind Textures
    gl.bindFramebuffer(gl.FRAMEBUFFER, destBuffer.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureToAdvect.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, velocityBuffer.texture);

    // 3. Bind Uniforms
    this.bindBasicUniforms(program);
    gl.uniform1f(this.uniformLocations[programId].dissipation, dissipation);
    gl.uniform1f(this.uniformLocations[programId].deltaTime, this.deltaTime * this.timeScale);
    gl.uniform1i(this.uniformLocations[programId].textureToAdvect, 0);
    gl.uniform1i(this.uniformLocations[programId].velocityTexture, 1);

    // 4. Bind Attributes
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

    // 5. Draw
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

    // 6. Unbind
    this.unbindTextures();
  }

  handleBoundary(sourceBuffer, destBuffer, boundaryEffects=1.0, isDye=false) {
    const gl = this.gl;

    const scale = isDye ? 1.0 : this.velocityScale;
    const offset = isDye ? 0.0 : 0.0;
    const dimension = isDye ? 1 : 2;

    // 1. Use Program
    let program = this.boundaryProgram;
    let programId = this.getProgramId(program);
    gl.useProgram(program);

    // 2. Bind Textures
    gl.bindFramebuffer(gl.FRAMEBUFFER, destBuffer.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceBuffer.texture);

    // 3. Bind Uniforms
    this.bindBasicUniforms(program);
    gl.uniform1i(this.uniformLocations[programId].bufferTexture, 0);
    gl.uniform1i(this.uniformLocations[programId].dimension, dimension);
    gl.uniform1f(this.uniformLocations[programId].boundaryEffects, boundaryEffects);

    // 4. Bind Attributes
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

    // 5. Draw
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);
    
    // 6. Unbind
    this.unbindTextures();
  }

  visualize(buffer, mode=0, min=-1, max=1) {
    const gl = this.gl;

    // 1. Use Program
    const program = this.program;
    const programId = this.getProgramId(program);
    gl.useProgram(program);

    // 2. Bind Textures
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, buffer.texture);

    // 3. Bind Uniforms
    this.bindBasicUniforms(program);
    gl.uniform1i(this.uniformLocations[programId].floatTexture, 0);
    gl.uniform1i(this.uniformLocations[programId].visualizationMode, mode);
    gl.uniform1f(this.uniformLocations[programId].minValue, min);
    gl.uniform1f(this.uniformLocations[programId].maxValue, max);

    // 4. Bind Attribute
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

    // 5. Draw
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

    // 6. Unbind
    this.unbindTextures();
  }

  /**
   * ユーザー入力処理
   */
  handleUserInput(velocitySourceBuffer, velocityDestBuffer, dyeSourceBuffer, dyeDestBuffer) {
    const activateDistance = 0.01;
    
    // 入力がない場合はスキップ
    if (!this.inputEvent || !this.isInputActive) {
      return false;
    }

    // 前フレームの位置がない場合は初期化
    if (!this.prevInputEvent) {
      this.prevInputEvent = { ...this.inputEvent }; // コピーを作成
      return false;
    }

    // 移動距離が小さい場合はスキップ
    const move = Vec2.create(
      this.inputEvent.x - this.prevInputEvent.x,
      this.inputEvent.y - this.prevInputEvent.y
    );
    const distance = Vec2.length(move);
    if (distance < activateDistance) {
      return false;
    }

    // velocityとdyeを追加
    this.addVelocity(velocitySourceBuffer, velocityDestBuffer);
    this.addDye(dyeSourceBuffer, dyeDestBuffer);

    // 前フレームの位置を更新
    this.prevInputEvent = { ...this.inputEvent };
    this.inputEvent = null; // 処理済みなのでクリア
    return true;
  }

  /**
   * velocity追加処理
   */
  addVelocity(sourceBuffer, destBuffer) {
    const effectRadius = 0.01;
    const effectScale = 1;

    const gl = this.gl;
    // 1. Use Program
    let program = this.addVelocityProgram;
    let programId = this.getProgramId(program);
    gl.useProgram(program);

    // 2. Bind Textures
    gl.bindFramebuffer(gl.FRAMEBUFFER, destBuffer.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceBuffer.texture);

    // 3. Bind Uniforms
    this.bindBasicUniforms(program);
    gl.uniform1i(this.uniformLocations[programId].bufferTexture, 0);
    gl.uniform2fv(this.uniformLocations[programId].previousMouse, [this.prevInputEvent.x, this.prevInputEvent.y]);
    gl.uniform2fv(this.uniformLocations[programId].currentMouse, [this.inputEvent.x, this.inputEvent.y]);
    gl.uniform1f(this.uniformLocations[programId].effectRadius, effectRadius);
    gl.uniform1f(this.uniformLocations[programId].effectScale, effectScale);

    // 4. Bind Attributes
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

    // 5. Draw
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

    // 6. Unbind
    this.unbindTextures();
  }

  /**
   * dye追加処理
   */
  addDye(sourceBuffer, destBuffer) {
    const effectRadius = 0.02;
    const effectScale = 1;
  
    const gl = this.gl;
    // 1. Use Program
    let program = this.addDyeProgram;
    let programId = this.getProgramId(program);
    gl.useProgram(program);

    // 2. Bind Textures
    gl.bindFramebuffer(gl.FRAMEBUFFER, destBuffer.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceBuffer.texture);

    // 3. Bind Uniforms
    this.bindBasicUniforms(program);
    gl.uniform1i(this.uniformLocations[programId].bufferTexture, 0);
    gl.uniform2fv(this.uniformLocations[programId].previousMouse, [this.prevInputEvent.x, this.prevInputEvent.y]);
    gl.uniform2fv(this.uniformLocations[programId].currentMouse, [this.inputEvent.x, this.inputEvent.y]);
    gl.uniform1f(this.uniformLocations[programId].effectRadius, effectRadius);
    gl.uniform1f(this.uniformLocations[programId].effectScale, effectScale);

    // 4. Bind Attributes
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
  
  refract(velocityBuffer, colorTexture) {
    const gl = this.gl;

    // 1. Use Program
    const program = this.refractProgram;
    const programId = this.getProgramId(program);
    gl.useProgram(program);

    // 2. Bind Textures
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocityBuffer.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, colorTexture);

    // 3. Bind Uniforms
    this.bindBasicUniforms(program);
    gl.uniform1i(this.uniformLocations[programId].velocityTexture, 0);
    gl.uniform1i(this.uniformLocations[programId].colorTexture, 1);

    // 4. Bind Attribute
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

    // 5. Draw
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);
   
    // 6. Unbind
    this.unbindTextures();
  }
  /**
   * レンダリングを行う
   */
  render() {
    requestAnimationFrame(this.render);
    this.setupRendering();

    // this.tmp();
    // this.tmp2(this.velocityBuffer);
    if(this.handleUserInput(this.velocityBuffer, this.velocityBufferTemp, this.dyeBuffer, this.dyeBufferTemp)){
      this.handleBoundary(this.velocityBufferTemp, this.velocityBuffer, -1.0);
      this.handleBoundary(this.dyeBufferTemp, this.dyeBuffer, 0.0, true);
    }

    // --- velocity --- 
    this.diffuse(this.velocityBuffer, this.velocityBufferTemp, 0.9);
    this.handleBoundary(this.velocityBufferTemp, this.velocityBuffer, -1.0);
    this.project(this.velocityBuffer, this.velocityBufferTemp);

    this.advect(this.velocityBufferTemp, this.velocityBufferTemp, this.velocityBuffer, 0.998);
    this.handleBoundary(this.velocityBuffer, this.velocityBufferTemp, -1.0);
    this.project(this.velocityBufferTemp, this.velocityBuffer);
    
    // this.blit(this.velocityBufferTemp, this.velocityBuffer);
    
    // --- dye ---
    // this.diffuse(this.dyeBuffer, this.dyeBufferTemp, 0.5);
    // this.handleBoundary(this.dyeBufferTemp, this.dyeBuffer, 0.0, true);
    // this.advect(this.dyeBuffer, this.velocityBuffer, this.dyeBufferTemp, 0.998);
    // this.handleBoundary(this.dyeBufferTemp, this.dyeBuffer, 0.0, true);


    this.refract(this.velocityBuffer, this.startingTexture);
    
    // if (this.showVelocity) {
    //   this.visualize(this.velocityBuffer, 0, -0.01, 0.01);
    // } else {
    //   this.visualize(this.dyeBuffer, 0, 0, 2);
    // }
  }
}
