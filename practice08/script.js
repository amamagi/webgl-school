import { WebGLUtility } from '../lib/webgl.js';
import { Mat4, Vec2, Vec3 } from '../lib/math.js';
import { WebGLGeometry } from '../lib/geometry.js';
// import { WebGLOrbitCamera } from '../lib/camera.js';
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
  boundaryProgram; // 境界条件処理用のプログラムオブジェクト
  addVelocityProgram; // 速度場に外力を加えるプログラムオブジェクト
  addDyeProgram; // 染料場に外力を加えるプログラムオブジェクト

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
  initialized = false; // 初期状態をセットしたかどうかのフラグ
  mouseMoveEvent;     // マウス移動イベント
  preveMouseMoveEvent; // 1フレーム前のマウス移動イベント
  isMouseDown;     // マウスが押されているかどうかのフラグ

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

    // this.camera = new WebGLOrbitCamera(this.canvas, cameraOption);

    // 最初に一度リサイズ処理を行っておく
    this.resize();

    // リサイズイベントの設定
    window.addEventListener('resize', this.resize, false);
    
    // 深度テストは初期状態で有効
    this.gl.enable(this.gl.DEPTH_TEST);

    this.quadMvpMatrix = this.calcMvp();

    // マウスイベントの設定
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this), false);
    this.canvas.addEventListener('mousedown', (event) => { this.isMouseDown = true; }, false);
    this.canvas.addEventListener('mouseup', (event) => { this.isMouseDown = false; }, false);
    this.canvas.addEventListener('mouseleave', (event) => { this.isMouseDown = false; }, false);
  }


  handleMouseMove(e) {
    if (!this.isMouseDown) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1.0-(e.clientY - rect.top) / rect.height;
    this.mouseMoveEvent = { x, y }; 
    console.log(this.mouseMoveEvent);
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
    if (program === this.getDivFreeProgram) return 'getDivFree';
    if (program === this.boundaryProgram) return 'boundary';
    if (program === this.addVelocityProgram) return 'addVelocity';
    if (program === this.addDyeProgram) return 'addDye';
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
    for (let program of [this.program, this.solverProgram, this.blitProgram, this.perlinProgram, this.advectionProgram,
      this.divergentProgram, this.getDivFreeProgram, this.boundaryProgram, this.addVelocityProgram, this.addDyeProgram]) {
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
      invertY: gl.getUniformLocation(this.blitProgram, 'u_invertY'),
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
    Object.assign(this.uniformLocations[this.getProgramId(this.boundaryProgram)], {
      bufferTexture: gl.getUniformLocation(this.boundaryProgram, 'u_bufferTexture'),
      scale: gl.getUniformLocation(this.boundaryProgram, 'u_scale'),
      dimension: gl.getUniformLocation(this.boundaryProgram, 'u_dimension')
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
      // // velocityBuffer の初期化
      // // 1. Use Program
      // const program = this.perlinProgram;
      // gl.useProgram(program);

      // // 2. Bind Textures
      // gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityBuffer.framebuffer);
      // this.setupRendering();

      // // 3. Bind Uniforms
      // this.bindBasicUniforms(program);

      // // 4. Bind Attributes
      // WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);
      
      // // 5. Draw
      // gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

      // // 6. Unbind
      // this.unbindTextures();
    }
    this.clearBuffer(this.velocityBuffer, [0.5, 0.5, 0.0, 0.0]);

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
      gl.uniform1i(this.uniformLocations[programId].invertY, 1);

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
    gl.uniform1i(this.uniformLocations[programId].invertY, 0);

    // 4. Bind Attributes
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

    // 5. Draw
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);
    
    // 6. Unbind
    this.unbindTextures();
  }

  diffuse(sourceBuffer, destBuffer, isDye=false) {
    const gl = this.gl;

    const scale = isDye ? 1.0 : 2.0;
    const offset = isDye ? 0.0 : 1.0;
    const clearColor = isDye ? [0.0, 0.0, 0.0, 0.0] : [0.5, 0.5, 0.0, 0.0];
    const viscosity = isDye ? 0.5 : 0.5;
    const timeStep = 0.1;

    
    // 1. Use Program
    let program = this.solverProgram;
    let programId = this.getProgramId(program);
    gl.useProgram(program);

    // 2. Bind Textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceBuffer.texture);
    this.clearBuffer(this.tempBufferA, clearColor);
    this.clearBuffer(this.tempBufferB, clearColor);

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

      const source = this.shouldTargetA ? this.tempBufferB : this.tempBufferA;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, source.texture);

      // 3.5. Update Uniforms for Ping-Pong
      // d_X = (d0_X + viscosity * deltaTime * (d_01 + d_02+ d_03 + d_04)) / (1 + 4 * viscosity * deltaTime)
      //     = (d0_X * 1 / (vis * dT) + (d_01 + d_02+ d_03 + d_04)) * (vis * dT) / (1 + 4 * vis * dT)
      //      = (d0_X * center + (d_01 + d_02+ d_03 + d_04)) * beta
      const centerFactor = 1.0 / (viscosity * timeStep);
      const beta = (viscosity * timeStep) / (1.0 + 4.0 * viscosity * timeStep);
      gl.uniform1i(this.uniformLocations[programId].bufferTexture, 1);
      gl.uniform1f(this.uniformLocations[programId].centerFactor, centerFactor);
      gl.uniform1f(this.uniformLocations[programId].beta, beta);
      gl.uniform1f(this.uniformLocations[programId].scale, scale);
      gl.uniform1f(this.uniformLocations[programId].offset, offset);

      // 5. Draw
      gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

      this.shouldTargetA = !this.shouldTargetA;
    }
    
    // 6. Unbind
    this.unbindTextures();
  }

  project(velocityBuffer, destBuffer) {
    const gl = this.gl;

    // --- velocity の発散をバッファーに書き出す ---
    this.divergence(velocityBuffer, this.velocityDivergenceBuffer);

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

    const itter = 30;
    let target;
    for (let i = 0; i < itter; i++) {
      this.shouldTargetA = !this.shouldTargetA;
      this.handleBoundary(this.shouldTargetA ? this.tempBufferB : this.tempBufferA, this.shouldTargetA ? this.tempBufferA : this.tempBufferB, 1.0);

      // 2.5. Bind Texture for Ping-Pong
      this.shouldTargetA = !this.shouldTargetA;
      target = this.shouldTargetA ? this.tempBufferA : this.tempBufferB;
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
    this.getDivFreeVelocity(target, velocityBuffer, destBuffer);
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

  advect(textureToAdvect, velocityBuffer, destBuffer, dissipation=0.99) {
    const gl = this.gl;
    const deltaTime = 0.5;

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
    gl.uniform1f(this.uniformLocations[programId].dissipation, dissipation);
    gl.uniform1f(this.uniformLocations[programId].deltaTime, deltaTime);
    gl.uniform1i(this.uniformLocations[programId].textureToAdvect, 0);
    gl.uniform1i(this.uniformLocations[programId].velocityTexture, 1);

    // 4. Bind Attributes
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

    // 5. Draw
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

    // 6. Unbind
    this.unbindTextures();
  }

  handleBoundary(sourceBuffer, destBuffer, scale, dimension=2) {
    const gl = this.gl;

    // 1. Use Program
    let program = this.boundaryProgram;
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
    gl.uniform1f(this.uniformLocations[programId].scale, scale);
    gl.uniform1f(this.uniformLocations[programId].dimension, dimension);

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
    const program = this.program;
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

  handleUserInput(velocitySourceBuffer, velocityDestBuffer, dyeSourceBuffer, dyeDestBuffer) {
    // クリック中、前フレームのマウス位置と現在のマウス位置から速度を計算し、velocityBufferに加算する
    if (!this.mouseMoveEvent) {
      this.blit(velocitySourceBuffer, velocityDestBuffer);
      this.blit(dyeSourceBuffer, dyeDestBuffer);
      return;
    }
    if (!this.preveMouseMoveEvent) {
      this.blit(velocitySourceBuffer, velocityDestBuffer);
      this.blit(dyeSourceBuffer, dyeDestBuffer);
      this.preveMouseMoveEvent = this.mouseMoveEvent;
      return;
    }
    const move = Vec2.create(
      this.mouseMoveEvent.x - this.preveMouseMoveEvent.x,
      this.mouseMoveEvent.y - this.preveMouseMoveEvent.y);
      const distance = Vec2.length(move);
    if(distance < 0.001) {
      this.blit(velocitySourceBuffer, velocityDestBuffer);
      this.blit(dyeSourceBuffer, dyeDestBuffer);
      this.preveMouseMoveEvent = this.mouseMoveEvent;
      return;
    }


    this.addVelocity(velocitySourceBuffer, velocityDestBuffer);
    // this.blit(velocitySourceBuffer, velocityDestBuffer);
    this.addDye(dyeSourceBuffer, dyeDestBuffer);
    // this.blit(dyeSourceBuffer, dyeDestBuffer);

    this.preveMouseMoveEvent = this.mouseMoveEvent;
    this.mouseMoveEvent = null;
  }

  addVelocity(sourceBuffer, destBuffer) {
    const effectRadius = 0.05;
    const effectScale = 10.0;

    const gl = this.gl;
    // 1. Use Program
    let program = this.addVelocityProgram;
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
    gl.uniform2fv(this.uniformLocations[programId].previousMouse, [this.preveMouseMoveEvent.x, this.preveMouseMoveEvent.y]);
    gl.uniform2fv(this.uniformLocations[programId].currentMouse, [this.mouseMoveEvent.x, this.mouseMoveEvent.y]);
    gl.uniform1f(this.uniformLocations[programId].effectRadius, effectRadius);
    gl.uniform1f(this.uniformLocations[programId].effectScale, effectScale);

    // 4. Bind Attributes
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);

    // 5. Draw
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);

    // 6. Unbind
    this.unbindTextures();
  }

  addDye(sourceBuffer, destBuffer) {
    const effectRadius = 0.05;
    const effectScale = 0.02;
  
    const gl = this.gl;
    // 1. Use Program
    let program = this.addDyeProgram;
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
    gl.uniform2fv(this.uniformLocations[programId].previousMouse, [this.preveMouseMoveEvent.x, this.preveMouseMoveEvent.y]);
    gl.uniform2fv(this.uniformLocations[programId].currentMouse, [this.mouseMoveEvent.x, this.mouseMoveEvent.y]);
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

  /**
   * レンダリングを行う
   */
  render() {
    requestAnimationFrame(this.render);
    this.setupRendering();

    // handleUserInput
    this.handleUserInput(this.velocityBuffer, this.velocityBufferTemp, this.dyeBuffer, this.dyeBufferTemp);

    // --- velocity --- 
    this.handleBoundary(this.velocityBufferTemp, this.velocityBuffer, -1.0);

    this.diffuse(this.velocityBuffer, this.velocityBufferTemp);
    this.handleBoundary(this.velocityBufferTemp, this.velocityBuffer, -1.0);
    this.project(this.velocityBuffer, this.velocityBufferTemp);

    this.advect(this.velocityBufferTemp, this.velocityBufferTemp, this.velocityBuffer, 1);
    this.handleBoundary(this.velocityBuffer, this.velocityBufferTemp, -1.0);
    this.project(this.velocityBufferTemp, this.velocityBuffer);
    
    // this.blit(this.velocityBufferTemp, this.velocityBuffer);

    
    // --- dye ---
    this.handleBoundary(this.dyeBufferTemp, this.dyeBuffer, 0.0, 1);
    this.diffuse(this.dyeBuffer, this.dyeBufferTemp, true);
    this.handleBoundary(this.dyeBufferTemp, this.dyeBuffer, 0.0, 1);
    this.advect(this.dyeBuffer, this.velocityBuffer, this.dyeBufferTemp, 1);
    this.handleBoundary(this.dyeBufferTemp, this.dyeBuffer, 0.0, 1);

    this.visualize(this.dyeBuffer);
    // this.visualize(this.velocityBuffer);
  }
}
