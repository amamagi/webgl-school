#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_bufferTexture;
uniform bool u_enableLighting;
uniform bool u_is2d;
uniform float u_scale;

vec3 light = normalize(vec3(1.0, 1.0, 1.0));

float base21(vec2 p){
    return texture(u_bufferTexture, p).x;
}

vec2 base22(vec2 p){
    return texture(u_bufferTexture, p).xy;
}

vec2 grad(vec2 p){
  float eps = 0.001;
  float x = base21(p + vec2(eps, 0.0)) - base21(p - vec2(eps, 0.0));
  float y = base21(p + vec2(0.0, eps)) - base21(p - vec2(0.0, eps));
  return vec2(x, y) / (2.0 * eps);
}

vec2 grad2(vec2 p){
  float eps = 0.001;
  vec2 x = base22(p + vec2(eps, 0.0)) - base22(p - vec2(eps, 0.0));
  vec2 y = base22(p + vec2(0.0, eps)) - base22(p - vec2(0.0, eps));
  x = x * u_scale;
  y = y * u_scale;
  return (x + y) / (2.0 * eps);
}


vec3[] ctable = vec3[](
  vec3(0.3529, 0.5294, 0.6941),
  vec3(0.4235, 0.5686, 0.702),
  vec3(0.6078, 0.6235, 0.8),
  vec3(0.6863, 0.6667, 0.7882),
  vec3(0.8588, 0.7098, 0.8353),
  vec3(0.8863, 0.8941, 0.749),
  vec3(0.7725, 0.8784, 0.749),
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



void main(){
    vec2 pos = gl_FragCoord.xy / u_resolution.xy;

    if (u_is2d){
      vec2 v = texture(u_bufferTexture, pos).xy * 2.0 - 1.0;
      v = (v * u_scale);
      vec3 normal = normalize(vec3(grad2(pos), 1.0));
      float lambert = dot(-normal, -light);
      vec3 color = vec3(1.0);
      if (u_enableLighting){
        color = vec3(lambert);
      }
      color *= rainbow(length(v));
      // color *= vec3(length(v));
      fragColor = vec4(color, 1.0);
      return;
    }

    vec3 normal = normalize(vec3(grad(pos), 1.0));
    float lambert = dot(-normal, -light);
    vec3 color = vec3(1.0);
    if(u_enableLighting){
      color = vec3(lambert);
    }
    float v = texture(u_bufferTexture, pos).x;
    v = pow(v, 0.8);
    v = mix(0.5, v, 0.5);
    color *= rainbow(v);
    fragColor = vec4(color, 1.0);
}