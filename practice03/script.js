import * as THREE from '../lib/three.module.js'
import {  OrbitControls } from '../lib/OrbitControls.js'
import { RoomEnvironment } from '../lib/RoomEnvironment.js';

window.addEventListener('DOMContentLoaded', async () => {
    const wrapper = document.querySelector('#webgl');
    const app = new ThreeApp(wrapper);
    await app.loadAssets();
    app.createScene();
    app.render();
}, false);

class ThreeApp{
    /** カメラ定義のための定数 */ 
    static CAMERA_PARAM = {
        fov: 40,
        near: 0.1,
        far: 100,
        position: new THREE.Vector3(0, 0, 3),
        lookAt: new THREE.Vector3(0, 0, 0)
    };
    /** レンダラー定義のための定数 */
    static RENDERER_PARAM = {
        clearColor: 0xeeeeee,
        width: window.innerWidth,
        height: window.innerHeight
    };
    /**
     * 平行光源定義のための定数
     */
    static DIRECTIONAL_LIGHT_PARAM = {
        color: 0xffffff,
        intensity: 1.0,
        position: new THREE.Vector3(1.0, 1.0, 1.0),
    };
    /**
     * アンビエントライト定義のための定数
     */
    static AMBIENT_LIGHT_PARAM = {
        color: 0xffffff,
        intensity: 0.5,
    };
    /** マテリアル定義のための定数 */
    static MATERIAL_PARAM = {
        color: 0xffffff,
    };
    static PLANE_BODY_MATERIAL_PARAM = {
        color: 0xd4e9ff,
    };
    static PLANE_WING_MATERIAL_PARAM = {
        color: 0xd4e9ff,
        side: THREE.DoubleSide
    };
    /** メッシュ定義のための定数 */
    static EARTH_MESH_PARM = {
        radius: 1,
        widthSegment: 32,
        heightSegment: 32
    };
    /**
     * フォグの定義のための定数
     */
    static FOG_PARAM = {
        color: 0xffffff,
        near: 10.0,
        far: 20.0,
    };


    wrapper;

    renderer;
    scene;
    camera;
    directionalLight;
    ambientLight;
    material;
    control;

    /** @type {THREE.Clock} */
    clock;
    /** @type {THREE.Object3D} */
    earth;
    earthTexture;
    /** @type {THREE.Object3D} */
    plane;
    /** @type {THREE.Object3D} */
    target;

    planeDistance = ThreeApp.EARTH_MESH_PARM.radius + 0.03;
    targetVector = new THREE.Vector3();
    prevPosition = new THREE.Vector3();

    /**
     * @constructor
     * @param {HTMLElement} wrapper - canvas 要素を append する親要素
     */
    constructor(wrapper){
        // 初期化時に canvas を append できるようにプロパティに保持
        this.wrapper = wrapper;

        // 再帰呼び出しのための this 固定
        this.render = this.render.bind(this);

        // キー押下イベント
        window.addEventListener('keydown', (keyEvent)=>{
            switch (keyEvent.key){
                case ' ':
                    this.isKeyDown = true;
                    break;
                default:
            }
        },false);
        window.addEventListener('keyup', (keyEvent)=>{
            this.isKeyDown = false;
        })

        // ウィンドウのリサイズを検出できるようにする
        window.addEventListener('resize', () => {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
        }, false);

        // window.addEventListener('pointermove', (pointerEvent) =>{
        //     const x = pointerEvent.clientX / window.innerWidth * 2.0 - 1.0;
        //     const y = pointerEvent.clientY / window.innerHeight * 2.0 - 1.0;

        //     const vec = new THREE.Vector2(x, y);
        //     vec.normalize();

        //     this.plane.position.set(vec.x * this.planeDistance, 0, vec.y * this.planeDistance);

        // })
    }

    loadAssets() {
        return new Promise((resolve) => {
            const earthPath = "../textures/earth.jpg";
            const loader = new THREE.TextureLoader();
            loader.load(earthPath, (earthTexture) => {
                this.earthTexture = earthTexture;
                resolve();
            })
        })
    }

    createScene(){
        // レンダラー
        const clearColor = new THREE.Color(ThreeApp.RENDERER_PARAM.clearColor);
        this.renderer = new THREE.WebGLRenderer({antialias: true});
        this.renderer.setClearColor(clearColor);
        this.renderer.setSize(ThreeApp.RENDERER_PARAM.width, ThreeApp.RENDERER_PARAM.height);
        // this.renderer.shadowMap.enabled = true;
        // this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.wrapper.appendChild(this.renderer.domElement);

        // シーン
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(
            ThreeApp.FOG_PARAM.color,
            ThreeApp.FOG_PARAM.near,
            ThreeApp.FOG_PARAM.far,
        )

        // const pmremGenerator = new THREE.PMREMGenerator( this.renderer );
        // this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment()).texture;

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

        // ディレクショナルライト
        this.directionalLight = new THREE.DirectionalLight(
            ThreeApp.DIRECTIONAL_LIGHT_PARAM.color,
            ThreeApp.DIRECTIONAL_LIGHT_PARAM.intensity
        )
        this.scene.add(this.directionalLight);

        // アンビエントライト
        this.ambientLight = new THREE.AmbientLight(
            ThreeApp.AMBIENT_LIGHT_PARAM.color,
            ThreeApp.AMBIENT_LIGHT_PARAM.intensity
        )
        this.scene.add(this.ambientLight);

        // 地球
        const earthGeometry = new THREE.SphereGeometry(
            ThreeApp.EARTH_MESH_PARM.radius,
            ThreeApp.EARTH_MESH_PARM.widthSegments,
            ThreeApp.EARTH_MESH_PARM.heightSegment,
        );
        const earthMaterial = new THREE.MeshPhongMaterial(ThreeApp.MATERIAL_PARAM);
        earthMaterial.map = this.earthTexture;
        this.earth = new THREE.Mesh(earthGeometry, earthMaterial);
        this.scene.add(this.earth);

        // 飛行機
        const planeBodyMaterial = new THREE.MeshPhongMaterial(ThreeApp.PLANE_BODY_MATERIAL_PARAM);
        const planeWingMaterial = new THREE.MeshPhongMaterial(ThreeApp.PLANE_WING_MATERIAL_PARAM);
        const planeBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.1), planeBodyMaterial);
        const planeWing = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.02), planeWingMaterial)
        const planeTailWing = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.01), planeWingMaterial)
        const planeTailWing2 = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.01), planeWingMaterial)
        planeBody.rotation.x = this.degToRad(90);
        planeWing.rotation.x = this.degToRad(90);
        planeTailWing.rotation.x = this.degToRad(90);
        planeTailWing.rotation.y = this.degToRad(45);
        planeTailWing.position.x = 0.01;
        planeTailWing.position.y = 0.01;
        planeTailWing.position.z = 0.05;
        planeTailWing2.rotation.x = this.degToRad(90);
        planeTailWing2.rotation.y = this.degToRad(-45);
        planeTailWing2.position.x = -0.01;
        planeTailWing2.position.y = 0.01;
        planeTailWing2.position.z = 0.05;
        this.plane = new THREE.Group();
        this.plane.add(planeBody);
        this.plane.add(planeWing);
        this.plane.add(planeTailWing);
        this.plane.add(planeTailWing2);
        this.plane.position.y = this.planeDistance;
        this.scene.add(this.plane);

        // this.plane.add(new THREE.AxesHelper());

        // ターゲット
        // this.target = new THREE.Mesh(new THREE.SphereGeometry(0.01), new THREE.MeshPhongMaterial(ThreeApp.MATERIAL_PARAM));
        // this.scene.add(this.target); 

        // コントロール
        this.control = new OrbitControls(this.camera, this.renderer.domElement);
        this.control.target = ThreeApp.CAMERA_PARAM.lookAt;
        this.control.autoRotate = true;
        this.control.autoRotateSpeed = 2;

        // クロック
        this.clock = new THREE.Clock();

        // this.scene.add(new THREE.AxesHelper(100));

        // this.plane.add(this.camera);
    }

    degToRad(x){
        return  x / 180 * Math.PI;
    }

    animation(){
        this.targetVector.x = Math.sin(-this.clock.getElapsedTime() * 0.21);
        this.targetVector.z = Math.cos(-this.clock.getElapsedTime() * 0.21);
        this.targetVector.y = Math.sin(this.clock.getElapsedTime() * 0.2) * 0.5;
        this.targetVector.normalize().multiplyScalar(this.planeDistance);
        // this.target.position.set(this.targetVector.x, this.targetVector.y, this.targetVector.z);
        
        // 機体を球表面に移動
        this.plane.position.copy(this.targetVector);
        
        // 機体の背を地球の法線方向に向ける
        const earthToPlane = new THREE.Vector3().subVectors( this.plane.position, this.earth.position);
        earthToPlane.normalize();
        const planeUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.plane.quaternion);
        const q1 = new THREE.Quaternion().setFromUnitVectors(planeUp, earthToPlane);
        this.plane.quaternion.premultiply(q1);

        // 機首を進行方向に向ける
        const planeDirection = new THREE.Vector3().subVectors(this.prevPosition, this.plane.position);
        planeDirection.normalize();
        const planeFront = new THREE.Vector3(0, 0, 1).applyQuaternion(this.plane.quaternion);
        const q2 = new THREE.Quaternion().setFromUnitVectors(planeFront, planeDirection);
        this.plane.quaternion.premultiply(q2);

        this.prevPosition = this.plane.position.clone();
    }

    now = performance.now();

    /** 描画処理 */
    render() {
        requestAnimationFrame(this.render);
        this.animation();
        // clock.getDelta()は精度が悪かったので使ってない
        const delta = (performance.now() - this.now) / 1000;
        this.now = performance.now();
        this.control.update(delta);
        this.renderer.render(this.scene, this.camera);
    }

}