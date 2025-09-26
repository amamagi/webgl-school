#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_pressureTexture;
uniform sampler2D u_velocityTexture;

vec2 gradient(vec2 uv){
    float divX = (texture(u_pressureTexture, uv + vec2(-1.0, 0.0) / u_resolution.xy).x
                - texture(u_pressureTexture, uv + vec2(1.0, 0.0) / u_resolution.xy).x) 
                / (2.0 / u_resolution.x);
    float divY = (texture(u_pressureTexture, uv + vec2(0.0, -1.0) / u_resolution.xy).x
                - texture(u_pressureTexture, uv + vec2(0.0, 1.0) / u_resolution.xy).x) 
                / (2.0 / u_resolution.y);
    return vec2(divX, divY);
}

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 grad = gradient(uv);
    vec2 velocity = texture(u_velocityTexture, uv).xy;
    fragColor = vec4(velocity - grad, 0.0, 1.0);
}