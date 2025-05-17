import * as THREE from '../lib/three.module.js'

window.addEventListener('DOMContentLoaded', () => {
    const wrapper = document.querySelector('#webgl');
    const app = new ThreeApp(wrapper);
    app.render();
}, false);

class ThreeApp{
    /** カメラ定義のための定数 */ 
    static ORTHO_CAMERA_PARAM = {
        minSize: 10,
        near: 1,
        far: 100,
        position: new THREE.Vector3(0, 0, 10),
        lookAt: new THREE.Vector3()
    };

    /** レンダラー定義のための定数 */
    static RENDERER_PARAM = {
        clearColor: 0xffffff,
        width: window.innerWidth,
        height: window.innerHeight
    };

    /**平行光源定義のための定数 */
    static DIRECTIONAL_LIGHT_PARAM = {
        color: 0xffffff,
        intensity: 1.5,
        position: new THREE.Vector3(1, 1, 2)
    };

    /** アンビエントライト定義のための定数 */
    static AMBIENT_LIGHT_PARAM = {
        color: 0xffffff,
        intensity: 1.0
    };

    /** マテリアル定義のための定数 */
    static MATERIAL_PARAM = {
        color: 0xffffff
    };

    /** メッシュ定義のための定数 */
    static MESH_PARM = {
        boxSize: 0.35,
        grids: 30
    };

    renderer;
    scene;
    camera;
    directionalLight;
    ambientLight;
    material;

    /** @type {THREE.Mesh[][]}*/
    meshes2d;

    /** @type {THREE.Clock} */
    clock;

    patternFlag = false;

    /**
     * @constructor
     * @param {HTMLElement} wrapper - canvas 要素を append する親要素
     */
    constructor(wrapper){
        // バインドしないとrequestAnimationFrameの中でthisを見失う
        this.render = this.render.bind(this);

        // レンダラー
        const clearColor = new THREE.Color(ThreeApp.RENDERER_PARAM.clearColor);
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setClearColor(clearColor);
        this.renderer.setSize(ThreeApp.RENDERER_PARAM.width, ThreeApp.RENDERER_PARAM.height);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        wrapper.append(this.renderer.domElement);

        // シーン
        this.scene = new THREE.Scene();

        // カメラ
        const cameraSize = this.calculateCameraSize();
        this.camera = new THREE.OrthographicCamera(
            cameraSize.left,
            cameraSize.right,
            cameraSize.top,
            cameraSize.bottom,
            ThreeApp.ORTHO_CAMERA_PARAM.near,
            ThreeApp.ORTHO_CAMERA_PARAM.far
        );
        this.camera.position.copy(ThreeApp.ORTHO_CAMERA_PARAM.position);
        this.camera.lookAt(ThreeApp.ORTHO_CAMERA_PARAM.lookAt);
        this.scene.add(this.camera);

        // ディレクショナルライト
        this.directionalLight = new THREE.DirectionalLight(
            ThreeApp.DIRECTIONAL_LIGHT_PARAM.color,
            ThreeApp.DIRECTIONAL_LIGHT_PARAM.intensity
        );
        this.directionalLight.castShadow = true
        this.directionalLight.position.copy(ThreeApp.DIRECTIONAL_LIGHT_PARAM.position);
        this.scene.add(this.directionalLight)

        // アンビエントライト
        this.ambientLight = new THREE.AmbientLight(
            ThreeApp.AMBIENT_LIGHT_PARAM.color,
            ThreeApp.AMBIENT_LIGHT_PARAM.intensity
        );
        this.scene.add(this.ambientLight);

        const geometry = new THREE.BoxGeometry(ThreeApp.MESH_PARM.boxSize, ThreeApp.MESH_PARM.boxSize, ThreeApp.MESH_PARM.boxSize);
        const material = new THREE.MeshStandardMaterial(ThreeApp.MATERIAL_PARAM);

        // メッシュ
        this.meshes2d = [];
        const MIN = -5;
        const MAX = 5;
        const LENGTH = MAX - MIN; 
        const GRIDS = ThreeApp.MESH_PARM.grids;
        for (var i = 0; i < GRIDS ; i++){
            this.meshes2d[i] = [];
            for (var j = 0; j < GRIDS; j++){
                const mesh = new THREE.Mesh(geometry, material);
                const x = MIN + LENGTH / (GRIDS - 1) * i;
                const y = MIN + LENGTH / (GRIDS - 1) * j;
                mesh.position.copy(new THREE.Vector3(x, y, 0));
                mesh.receiveShadow = true;
                mesh.castShadow = true;
                this.meshes2d[i][j] = mesh;
                this.scene.add(this.meshes2d[i][j]);
            }
        }

        this.clock = new THREE.Clock();

        // this.scene.add(new THREE.AxesHelper());

        // ウィンドウのリサイズを検出できるようにする
        window.addEventListener('resize', () => {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.setCameraSize(this.calculateCameraSize());
            this.camera.updateProjectionMatrix();
        }, false);

        // クリックでパターン切り替え
        window.addEventListener('click', (ev)=> {
            this.patternFlag = this.patternFlag ? false : true;
        }, false)
    }

    calculateCameraSize(){
        var w, h;
        if (window.innerWidth > window.innerHeight){
            h = ThreeApp.ORTHO_CAMERA_PARAM.minSize;
            w = h / window.innerHeight * window.innerWidth;
        }else
        {    
            w = ThreeApp.ORTHO_CAMERA_PARAM.minSize;
            h = w / window.innerWidth * window.innerHeight;
        }
        return {left: w / -2, right: w / 2, top: h / 2, bottom: h / -2};
    }

    setCameraSize(c){
        this.camera.left = c.left;
        this.camera.right = c.right;
        this.camera.top = c.top;
        this.camera.bottom = c.bottom;
    }

    /** 描画処理 */
    render() {
        requestAnimationFrame(this.render);

        for (var i = 0; i < ThreeApp.MESH_PARM.grids; i++){
            for (var j = 0; j < ThreeApp.MESH_PARM.grids; j++){
                const t = this.clock.getElapsedTime();
                const mesh = this.meshes2d[i][j];

                // rotation animation
                mesh.rotation.y = Math.sin(t * 2);
                mesh.rotation.x = t * i * 0.01;
                mesh.rotation.z = t * j * 0.01;
                
                // z animation
                const SPEED = 1;
                const AMP = 1.5;
                const x = mesh.position.x;
                const y = mesh.position.y;
                const z = Math.sin(- t * SPEED + new THREE.Vector2(x, y).length()) * AMP;
                const z2 = Math.sign(z) * z * z;
                mesh.position.z = z2;
            }
        }

       this.renderer.render(this.scene, this.camera);
    }

}