#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;

uniform sampler2D u_bufferTexture;

uniform vec2 u_previousMouse; // in [0, 1]
uniform vec2 u_currentMouse;  // in [0, 1]

uniform float u_effectRadius;
uniform float u_effectScale;

float sdSegment( in vec2 p, in vec2 a, in vec2 b )
{
    vec2 pa = p-a, ba = b-a;
    float h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );
    return length( pa - ba*h );
}

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 currentVelocity = texture(u_bufferTexture, uv).xy;

    vec2 mouseMove = normalize((u_currentMouse - u_previousMouse));
    float distanceToMouse = sdSegment(uv, u_previousMouse, u_currentMouse);
    vec2 mouseToUv = normalize(uv - u_currentMouse);

    // gaussian falloff
    float effect = exp(-distanceToMouse * distanceToMouse / (u_effectRadius * u_effectRadius));
    vec2 newVelocity = currentVelocity + (mouseMove + mouseToUv) * effect * u_effectScale;

    // Direct output - no compression needed for float textures
    fragColor = vec4(newVelocity, 0.0, 0.0);
}