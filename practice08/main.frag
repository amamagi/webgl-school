#version 300 es
precision highp float;
precision highp int;
out vec4 fragColor;
uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_bufferTexture;
int channel;

//start hash
uvec3 k = uvec3(0x456789abu, 0x6789ab45u, 0x89ab4567u);
uvec3 u = uvec3(1, 2, 3);
const uint UINT_MAX = 0xffffffffu;
uint uhash11(uint n){
    n ^= (n << u.x);
    n ^= (n >> u.x);
    n *= k.x;
    n ^= (n << u.x);
    return n * k.x;
}
uvec2 uhash22(uvec2 n){
    n ^= (n.yx << u.xy);
    n ^= (n.yx >> u.xy);
    n *= k.xy;
    n ^= (n.yx << u.xy);
    return n * k.xy;
}
uvec3 uhash33(uvec3 n){
    n ^= (n.yzx << u);
    n ^= (n.yzx >> u);
    n *= k;
    n ^= (n.yzx << u);
    return n * k;
}
float hash11(float p){
    uint n = floatBitsToUint(p);
    return float(uhash11(n)) / float(UINT_MAX);
}
float hash21(vec2 p){
    uvec2 n = floatBitsToUint(p);
    return float(uhash22(n).x) / float(UINT_MAX);
}
float hash31(vec3 p){
    uvec3 n = floatBitsToUint(p);
    return float(uhash33(n).x) / float(UINT_MAX);
}
vec2 hash22(vec2 p){
    uvec2 n = floatBitsToUint(p);
    return vec2(uhash22(n)) / vec2(UINT_MAX);
}
vec3 hash33(vec3 p){
    uvec3 n = floatBitsToUint(p);
    return vec3(uhash33(n)) / vec3(UINT_MAX);
}
//end hash

//start gnoise
float gnoise21(vec2 p){
    vec2 n = floor(p);
    vec2[4] g;
    for (int j = 0; j < 2; j ++){
        for (int i = 0; i < 2; i++){
            g[i+2*j] = normalize(hash22(n + vec2(i,j)) - vec2(0.5));
        }
    }
    vec2 f = fract(p);
    float[4] v;
    for (int j = 0; j < 2; j ++){
        for (int i = 0; i < 2; i++){
            v[i+2*j] = dot(g[i+2*j], f - vec2(i, j));
        }
    }
    f = f * f * f * (10.0 - 15.0 * f + 6.0 * f * f);
    return 0.5 * mix(mix(v[0], v[1], f[0]), mix(v[2], v[3], f[0]), f[1]) + 0.5;
}
float gnoise31(vec3 p){
    vec3 n = floor(p);
    vec3[8] g;
    for (int k = 0; k < 2; k++ ){
        for (int j = 0; j < 2; j++ ){
            for (int i = 0; i < 2; i++){
                g[i+2*j+4*k] = normalize(hash33(n + vec3(i, j, k)) - vec3(0.5));
            }
            
        }
    }
    vec3 f = fract(p);
    float[8] v;
    for (int k = 0; k < 2; k++ ){
        for (int j = 0; j < 2; j++ ){
            for (int i = 0; i < 2; i++){
                v[i+2*j+4*k] = dot(g[i+2*j+4*k], f - vec3(i, j, k));
            }
            
        }
    }
    f = f * f * f * (10.0 - 15.0 * f + 6.0 * f * f);
    float[2] w;
    for (int i = 0; i < 2; i++){
        w[i] = mix(mix(v[4*i], v[4*i+1], f[0]), mix(v[4*i+2], v[4*i+3], f[0]), f[1]);
    }
    return 0.5 * mix(w[0], w[1], f[2]) + 0.5;
}
//end gnoise

//start pnoise
float gtable2(vec2 lattice, vec2 p){
    uvec2 n = floatBitsToUint(lattice);
    uint ind = uhash22(n).x >> 29;
    float u = 0.92387953 * (ind < 4u ? p.x : p.y);  //0.92387953 = cos(pi/8)
    float v = 0.38268343 * (ind < 4u ? p.y : p.x);  //0.38268343 = sin(pi/8)
    return ((ind & 1u) == 0u ? u : -u) + ((ind & 2u) == 0u? v : -v);
}
float pnoise21(vec2 p){
    vec2 n = floor(p);
    vec2 f = fract(p);
    float[4] v;
    for (int j = 0; j < 2; j ++){
        for (int i = 0; i < 2; i++){
            v[i+2*j] = gtable2(n + vec2(i, j), f - vec2(i, j));
        }
    }
    f = f * f * f * (10.0 - 15.0 * f + 6.0 * f * f);
    return 0.5 * mix(mix(v[0], v[1], f[0]), mix(v[2], v[3], f[0]), f[1]) + 0.5;
}
float gtable3(vec3 lattice, vec3 p){
    uvec3 n = floatBitsToUint(lattice);
    uint ind = uhash33(n).x >> 28;
    float u = ind < 8u ? p.x : p.y;
    float v = ind < 4u ? p.y : ind == 12u || ind == 14u ? p.x : p.z;
    return ((ind & 1u) == 0u? u: -u) + ((ind & 2u) == 0u? v : -v);
}

float pnoise31(vec3 p){
    vec3 n = floor(p);
    vec3 f = fract(p);
    float[8] v;
    for (int k = 0; k < 2; k++ ){
        for (int j = 0; j < 2; j++ ){
            for (int i = 0; i < 2; i++){
                v[i+2*j+4*k] = gtable3(n + vec3(i, j, k), f - vec3(i, j, k)) * 0.70710678;
            }
            
        }
    }
    f = f * f * f * (10.0 - 15.0 * f + 6.0 * f * f);
    float[2] w;
    for (int i = 0; i < 2; i++){
        w[i] = mix(mix(v[4*i], v[4*i+1], f[0]), mix(v[4*i+2], v[4*i+3], f[0]), f[1]);
    }
    return 0.5 * mix(w[0], w[1], f[2]) + 0.5;
}
//end pnoise

float fbm21(vec2 p, float g){
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 4; i++){
        val += amp * pnoise31(vec3(freq * p, u_time / 10.0));
        amp *= g;
        freq *= 2.01;
    }
    return val;
}

vec2 satinDistortion(vec2 uv) {
    // 基本織り目
    float warpFreq = 10.0;  // 縦糸密度
    float weftFreq = 10.0;  // 横糸密度（異なる密度が重要）
    
    // 縦糸の波打ち
    float warp = sin(uv.y * warpFreq * 0.1) * 0.002;
    
    // 横糸の波打ち（位相をずらす）
    float weft = sin(uv.x * weftFreq * 0.15 + 1.57) * 0.0015;
    
    // サテン特有の斜め織り
    float diagonal = sin((uv.x + uv.y) * 100.0) * 0.001;
    
    // 織り目の交差パターン
    float crossWeave = sin(uv.x * weftFreq) * sin(uv.y * warpFreq) * 0.0008;
    
    return uv + vec2(warp + diagonal, weft + crossWeave);
}

const float PI = 3.14159265359;
float warp21(vec2 p, float g){
    float val = 0.0;
    for (int i = 0; i < 4; i++){
        vec2 uv = p + g * vec2(cos(2.0 * PI * val), sin(2.0 * PI * val));
        if(i==3) uv = satinDistortion(uv);
        val = pnoise31(vec3(uv, u_time / 10.0));
    }
    return val;
}
float gaussianMountain(vec2 pos, vec2 center, float sigma) {
    float dist = length(pos - center);
    return exp(-0.5 * (dist * dist) / (sigma * sigma));
}
float base21(vec2 p){
    // 山
    // return gaussianMountain(p, vec2(0.5, 0.5), 0.2);
    return warp21(p, 0.5);
}

vec2 grad(vec2 p){
  float eps = 0.001;
  float x = base21(p + vec2(eps, 0.0)) - base21(p - vec2(eps, 0.0));
  float y = base21(p + vec2(0.0, eps)) - base21(p - vec2(0.0, eps));
  return vec2(x, y) / (2.0 * eps);
}

float atan2(float y, float x){
  return x == 0.0 ? sign(y) * PI / 2.0 : atan(y, x);
}

vec3 hsv2rgb(float h, float s, float v) {
	return ((clamp(abs(fract(h+vec3(0,2,1)/3.)*6.-3.)-1.,0.,1.)-1.)*s+1.)*v;
}

// Compressed OKLCH to RGB conversion for GLSL
vec3 oklch2rgb(float L, float C, float H) {
    float h = radians(H);
    float a = C * cos(h), b = C * sin(h);
    float l = L + 0.3963377774 * a + 0.2158037573 * b;
    float m = L - 0.1055613458 * a - 0.0638541728 * b;
    float s = L - 0.0894841775 * a - 1.2914855480 * b;
    vec3 lms = vec3(l*l*l, m*m*m, s*s*s);
    vec3 rgb = vec3(4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
                   -1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
                   -0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.7076147010 * lms.z);
    return clamp(mix(12.92 * rgb, 1.055 * pow(max(rgb, 0.0), vec3(1.0/2.4)) - 0.055, step(0.0031308, rgb)), 0.0, 1.0);
}

vec3[] ctable = vec3[](
  vec3(0.2118, 0.5137, 0.6902),
  vec3(0.4235, 0.5686, 0.702),
  vec3(0.6078, 0.6235, 0.8),
  vec3(0.6863, 0.6667, 0.7882),
  vec3(0.86, 0.71, 0.82),
  vec3(0.8863, 0.8941, 0.749),
  vec3(0.84, 0.92, 0.82),
  vec3(0.66, 0.87, 0.93)
);

vec3 rainbow(float v){
  //v = clamp(v, 0.0, 1.0);
  float size = 7.0;
  int ch = int(v * size);
  vec3 s = ctable[ch];
  vec3 g = ctable[ch+1];
  return mix(s, g, fract(v*size));//smoothstep(0.0, 1.0, fract(v * size)));
}


vec3 light = normalize(vec3(1.0, 0.0, 1.0));

void main(){

    vec2 pos = gl_FragCoord.xy / u_resolution.xy;
    channel = int(gl_FragCoord.x * 2.0 / u_resolution.x);

    pos *= 1.0;
    
    // noise
    // float v = base21(pos);
    // vec2 g = grad(pos);
    // vec3 normal = normalize(vec3(grad(pos), 1.0));
    // float lambert = dot(-normal, -light);
    // float theta = abs(atan2(normal.y, normal.x));

    vec3 color;

    float v = texture(u_bufferTexture, pos).x;

    vec3 r = rainbow(smoothstep(0.2, 0.8, v));// * oklch2rgb(1.0, 0.05, theta * 180.0 / PI + u_time * 10.0);
    r = pow(r, vec3(0.8));
    // color = pow(color, vec3(2.2));
    // color = rainbow(v);// + oklch2rgb(lambert, 0.1, theta * 180.0 / PI + u_time * 10.0) * 0.05;

    color = mix(oklch2rgb(0.7, 0.1, 276.0), oklch2rgb(0.8, 0.06, 216.0), v);

    color = mix(color, r,1.0 - v) ;
    color = smoothstep(0.2, 0.8, color * 0.8);
    

    // color = smoothstep(0.1, 0.9, color);
    
    // c += pow(theta, 1.0) * ctable[1] * 0.5;

    // c += v * ctable[0];
    // c += hsv2rgb(vec3(0.6, lambert,0.1 + 0.9 * lambert * lambert));
    // vec3 c = hsv2rgb(vec3(pow(1.-lambert, 2.0), 0.3, lambert * 0.8 + 0.2));
    
    // if (channel < 1){
    //     float v = base21(pos);
    //     c =vec3(pow(v, 3.)) * c;
    // } else{
    // }

    // vec3 rainbow = hsv2rgb(vec3(v, 0.5, 1.0));


    fragColor = vec4(color, 1.0);

    // fragColor.rgb = vec3(v);
    fragColor.a = 1.0;
}