import { WebGLUtility } from '../lib/webgl.js';
import { Mat4 } from '../lib/math.js';
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
  program;           // WebGLProgram （プログラムオブジェクト）
  attributeLocation; // attribute 変数のロケーション
  attributeStride;   // attribute 変数のストライド
  uniformLocation;   // uniform 変数のロケーション
  planeGeometry;     // 板ポリゴンのジオメトリ情報
  planeVBO;          // 板ポリゴンの頂点バッファ
  planeIBO;          // 板ポリゴンのインデックスバッファ
  startTime;         // レンダリング開始時のタイムスタンプ
  camera;            // WebGLOrbitCamera のインスタンス
  isRendering;       // レンダリングを行うかどうかのフラグ
  textures = [];           // テクスチャのインスタンス @@@
  textureVisibility; // テクスチャの可視性 @@@

  constructor() {
    // this を固定するためのバインド処理
    this.resize = this.resize.bind(this);
    this.render = this.render.bind(this);
  }

  /**
   * 初期化処理を行う
   */
  init() {
    // canvas エレメントの取得と WebGL コンテキストの初期化
    this.canvas = document.getElementById('webgl-canvas');
    this.gl = WebGLUtility.createWebGLContext(this.canvas);

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

    // 深度テストは初期状態で有効
    this.gl.enable(this.gl.DEPTH_TEST);

    // 初期状態ではテクスチャが見えているようにする @@@
    this.textureVisibility = true;
  }

  /**
   * tweakpane の初期化処理
   */
  setupPane() {
    // Tweakpane を使った GUI の設定
    const pane = new Pane();
    const parameter = {
      texture: this.textureVisibility,
    };
    // テクスチャの表示・非表示 @@@
    pane.addBinding(parameter, 'texture')
    .on('change', (v) => {
      this.textureVisibility = v.value;
    });
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

        // 画像を読み込み、テクスチャを初期化する @@@
        const image0 = await WebGLUtility.loadImage('../textures/ehho.png');
        const image1 = await WebGLUtility.loadImage('../textures/doge.png');
        this.textures[0] = WebGLUtility.createTexture(gl, image0);
        this.textures[1] = WebGLUtility.createTexture(gl, image1);

        // Promsie を解決
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
    // attribute location の取得
    this.attributeLocation = [
      gl.getAttribLocation(this.program, 'position'),
      gl.getAttribLocation(this.program, 'normal'),
      gl.getAttribLocation(this.program, 'color'),
      gl.getAttribLocation(this.program, 'texCoord'), // テクスチャ座標 @@@
    ];
    // attribute のストライド
    this.attributeStride = [
      3,
      3,
      4,
      2, // ストライドは２ @@@
    ];
    // uniform location の取得
    this.uniformLocation = {
      mvpMatrix: gl.getUniformLocation(this.program, 'mvpMatrix'),
      mMatrix: gl.getUniformLocation(this.program, 'mMatrix'),
      normalMatrix: gl.getUniformLocation(this.program, 'normalMatrix'),
      textureUnit0: gl.getUniformLocation(this.program, 'textureUnit0'),
      textureUnit1: gl.getUniformLocation(this.program, 'textureUnit1'),
      eyePos: gl.getUniformLocation(this.program, 'eyePos')
    };
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

  /**
   * レンダリングを行う
   */
  render() {
    const gl = this.gl;

    // レンダリングのフラグの状態を見て、requestAnimationFrame を呼ぶか決める
    if (this.isRendering === true) {
      requestAnimationFrame(this.render);
    }

    // 現在までの経過時間
    const nowTime = (Date.now() - this.startTime) * 0.001;

    // レンダリングのセットアップ
    this.setupRendering();

    // モデル座標変換行列（ここでは特になにもモデル座標変換は掛けていない）
    const m = Mat4.identity();

    // ビュー・プロジェクション座標変換行列
    const v = this.camera.update();
    const fovy = 45;
    const aspect = window.innerWidth / window.innerHeight;
    const near = 0.1
    const far = 10.0;
    const p = Mat4.perspective(fovy, aspect, near, far);

    // 行列を乗算して MVP 行列を生成する（掛ける順序に注意）
    const vp = Mat4.multiply(p, v);
    const mvp = Mat4.multiply(vp, m);

    // モデル座標変換行列の、逆転置行列を生成する
    const normalMatrix = Mat4.transpose(Mat4.inverse(m));

    // テクスチャを各ユニットにバインドする @@@
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[1]);

    // プログラムオブジェクトを選択し uniform 変数を更新する
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniformLocation.mvpMatrix, false, mvp);
    gl.uniformMatrix4fv(this.uniformLocation.mMatrix, false, m);
    gl.uniformMatrix4fv(this.uniformLocation.normalMatrix, false, normalMatrix);
    gl.uniform1i(this.uniformLocation.textureUnit0, 0); // テクスチャユニットの番号を送る @@@
    gl.uniform1i(this.uniformLocation.textureUnit1, 1);
    gl.uniform3fv(this.uniformLocation.eyePos, this.camera.position);

    // VBO と IBO を設定し、描画する
    WebGLUtility.enableBuffer(gl, this.planeVBO, this.attributeLocation, this.attributeStride, this.planeIBO);
    gl.drawElements(gl.TRIANGLES, this.planeGeometry.index.length, gl.UNSIGNED_SHORT, 0);
  }
}
