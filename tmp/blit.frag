#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D u_bufferTexture;
uniform bool u_invertY;
uniform bool u_grayScale;

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    if (u_invertY) {
        uv.y = 1.0 - uv.y;
    }
    fragColor = vec4(texture(u_bufferTexture, uv).rgb, 1.0);
    if (u_grayScale) {
        float gray = dot(fragColor.rgb, vec3(0.299, 0.587, 0.114)) ;
        fragColor = vec4(vec3(gray), 1.0);
    }
}