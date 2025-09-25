#version 300 es
precision highp float;
precision highp int;
out vec4 fragColor;
uniform float u_deltaTime;
uniform vec2 u_resolution;
uniform sampler2D u_velocityTexture;
uniform sampler2D u_textureToAdvect;
uniform float u_dissapationFactor;

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec4 velocity = texture(u_velocityTexture, uv);
    vec4 oldValue = texture(u_textureToAdvect, uv);
    vec2 newUV = uv - velocity * u_deltaTime / u_resolution.xy;
    newUV = clamp(newUV, vec2(0.0), vec2(1.0));
    vec4 newValue = texture(u_textureToAdvect, newUV);

    fragColor = oldValue * u_dissapationFactor + newValue * (1.0 - u_dissapationFactor);
}