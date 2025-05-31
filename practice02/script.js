import * as THREE from '../lib/three.module.js'
import {  OrbitControls } from '../lib/OrbitControls.js'
import { RoomEnvironment } from '../lib/RoomEnvironment.js';

window.addEventListener('DOMContentLoaded', () => {
    const wrapper = document.querySelector('#webgl');
    const app = new ThreeApp(wrapper);
    app.render();
}, false);

class ThreeApp{
    /** カメラ定義のための定数 */ 
    static CAMERA_PARAM = {
        fov: 40,
        near: 1,
        far: 100,
        position: new THREE.Vector3(-2, 1.2, 3),
        lookAt: new THREE.Vector3(0, 0.9, 0)
    };

    /** レンダラー定義のための定数 */
    static RENDERER_PARAM = {
        clearColor: 0xeeeeee,
        width: window.innerWidth,
        height: window.innerHeight
    };

    /** マテリアル定義のための定数 */
    static MATERIAL_PARAM = {
        color: 0x888888,
        roughness: 0.2,
        metalness: 1,
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
    control;

    /** @type {THREE.Object3D}*/
    objectsRoot;

    /** @type {THREE.Object3D}*/
    neckRoot;

    /** @type {THREE.Object3D}*/
    fanRoot;

    /** @type {THREE.Clock} */
    clock = new THREE.Clock();;

    /** @type {bool} */
    enableAnimation = true;

    /**
     * @constructor
     * @param {HTMLElement} wrapper - canvas 要素を append する親要素
     */
    constructor(wrapper){
        // バインドしないとrequestAnimationFrameの中でthisを見失う
        this.render = this.render.bind(this);

        // レンダラー
        const clearColor = new THREE.Color(ThreeApp.RENDERER_PARAM.clearColor);
        this.renderer = new THREE.WebGLRenderer({antialias: true});
        this.renderer.setClearColor(clearColor);
        this.renderer.setSize(ThreeApp.RENDERER_PARAM.width, ThreeApp.RENDERER_PARAM.height);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        wrapper.append(this.renderer.domElement);

        // シーン
        this.scene = new THREE.Scene();
        const pmremGenerator = new THREE.PMREMGenerator( this.renderer );
        this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment()).texture;

        // カメラ
        this.camera = new THREE.PerspectiveCamera(
            ThreeApp.CAMERA_PARAM.fov,
            window.innerWidth / window.innerHeight,
            ThreeApp.CAMERA_PARAM.near,
            ThreeApp.CAMERA_PARAM.far
        );
        this.camera.position.copy(ThreeApp.CAMERA_PARAM.position);
        this.camera.lookAt(ThreeApp.CAMERA_PARAM.lookAt);
        this.scene.add(this.camera);			

        // 扇風機を作る
        this.createElectricFan();

        this.control = new OrbitControls(this.camera, this.renderer.domElement);
        this.control.target = ThreeApp.CAMERA_PARAM.lookAt;
        this.control.update();

        // this.scene.add(new THREE.AxesHelper(100));

        // ウィンドウのリサイズを検出できるようにする
        window.addEventListener('resize', () => {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
        }, false);
    }

    createElectricFan(){
        const material = new THREE.MeshStandardMaterial(ThreeApp.MATERIAL_PARAM);
        const pillerHeight = 1.2
        this.objectsRoot = new THREE.Group();
        this.scene.add(this.objectsRoot);

        // 土台オブジェクト
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 64), material);
        this.objectsRoot.add(base)
        const piller = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, pillerHeight), material);
        piller.position.y = pillerHeight / 2;
        this.objectsRoot.add(piller);

        // 首オブジェクト
        this.neckRoot = new THREE.Group();
        this.neckRoot.position.y = pillerHeight;
        this.objectsRoot.add(this.neckRoot);
        
        const neckWrapper = new THREE.Group()
        neckWrapper.rotation.x = this.degToRad(-10)
        this.neckRoot.add(neckWrapper);

        const neckLength = 0.4;
        const axisLength = 0.1;
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, neckLength), material);
        neck.rotation.x = this.degToRad(90);
        neckWrapper.add(neck);

        const axis = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.15, axisLength), material);
        axis.rotation.x = this.degToRad(90);
        axis.position.z = neckLength / 2 + axisLength / 2;
        neckWrapper.add(axis);

        // 羽オブジェクト
        this.fanRoot = new THREE.Group();
        const fanMaterial = new THREE.MeshStandardMaterial(ThreeApp.MATERIAL_PARAM);
        fanMaterial.side = 2;

        for (var i = 0; i < 4; i++){
            const shape = new THREE.Shape();
            const x = 0, y = 0;
            const fanSize = 0.7;
            shape.moveTo(x, y)

            const seg = 10;
            for (var j = 1; j <= seg; j++){
                const nx = x + j / seg * fanSize;
                const ny = y + Math.sin(Math.pow(j / seg, 1.7)  * Math.PI) * fanSize * 0.5;
                shape.lineTo(nx, ny);
            }

            const bladeWrapper = new THREE.Group()
            const blade = new THREE.Mesh(new THREE.ShapeGeometry(shape), fanMaterial);
            blade.rotation.x = this.degToRad(20);
            blade.rotation.z = this.degToRad(-20);
            bladeWrapper.add(blade)

            bladeWrapper.rotation.z = this.degToRad(90 * i);
            this.fanRoot.add(bladeWrapper);
        }
        this.fanRoot.position.set(0, 0, neckLength / 2 + axisLength);
        neckWrapper.add(this.fanRoot);
    }

    calculateNeckRotation(t){
        const rotationRangeDeg = 120;
        const stopDuration = 0.01;

        const nt = t / 2 % 2;
        const triWave = nt > 1 ? 2 - nt : nt;

        const min = stopDuration * 2;
        const max = 1 - stopDuration * 2;
        const trancTriWave = (Math.min(Math.max(triWave, min), max) - min) / (max - min)

        // InOutCubic
        const smoothedWave = trancTriWave < 0.5 ? 4 * Math.pow(trancTriWave, 3) : 1 - Math.pow(-2 * trancTriWave + 2, 3) / 2;

        const rot =  smoothedWave * this.degToRad(rotationRangeDeg) - this.degToRad(rotationRangeDeg / 2);

        return rot;
    }

    degToRad(x){
        return  x / 180 * Math.PI;
    }

    /** 描画処理 */
    render() {
        requestAnimationFrame(this.render);

        // Animation
        const neckSpeed = 0.2;
        const fanSpeed = 8;

        if (this.enableAnimation){
            this.neckRoot.rotation.y = this.calculateNeckRotation(this.clock.getElapsedTime() * neckSpeed);
            this.fanRoot.rotation.z = -this.clock.getElapsedTime() * fanSpeed;
        }

        this.control.update();

        this.renderer.render(this.scene, this.camera);
    }

}