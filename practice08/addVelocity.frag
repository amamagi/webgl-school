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
uniform float u_deltaTime;
uniform float u_velocityScale;

float sdSegment( in vec2 p, in vec2 a, in vec2 b )
{
    vec2 pa = p-a, ba = b-a;
    float h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );
    return length( pa - ba*h );
}

vec2 restoreVelocity(vec2 texValue) {
    return texValue * u_velocityScale * 2.0 - u_velocityScale; // [0, 1] -> [-vs, vs]
}

vec2 compressVelocity(vec2 velocity) {
    return (velocity + u_velocityScale) / (u_velocityScale * 2.0); // [-vs, vs] -> [0, 1]
}

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 currentVelocity = restoreVelocity(texture(u_bufferTexture, uv).xy);

    vec2 mouseVelocity = normalize((u_currentMouse - u_previousMouse)) / u_deltaTime;
    float distanceToMouse = sdSegment(uv, u_previousMouse, u_currentMouse);

    // gaussian falloff
    float effect = exp(-distanceToMouse * distanceToMouse / (u_effectRadius * u_effectRadius));
    vec2 newVelocity = currentVelocity + effect * mouseVelocity * u_effectScale;

    newVelocity = compressVelocity(newVelocity);

    fragColor = vec4(newVelocity, 0.0, 0.0);
}