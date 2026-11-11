//! Binds a NEAR AI `provider_tee` signature to one release.
//!
//! The signed text is `model:sha256(request):sha256(response)`, recovered with
//! Ethereum EIP-191. Both bodies must contain the release line. The Intel quote
//! is not checked. The caller pins the signer when the contract is created.

use hex::FromHex;
use near_sdk::env;

const BODY_LIMIT: usize = 16384;

/// One line, so the same bytes can sit inside a JSON request and response.
pub fn release_line(id: u64, recipient: &str, amount: u128, evidence_hex: &str) -> String {
    format!(
        "meter:{id} recipient:{recipient} amount:{amount} evidence:{}",
        evidence_hex.to_ascii_lowercase()
    )
}

pub fn check(
    model: &str,
    tee_signer: &[u8; 20],
    line: &str,
    request: &str,
    response: &str,
    signature_hex: &str,
) -> Result<(), &'static str> {
    if request.len() > BODY_LIMIT || response.len() > BODY_LIMIT {
        return Err("ERR_ATTESTATION");
    }
    if !request.contains(line) || !response.contains(line) {
        return Err("ERR_ATTEST_LINE");
    }
    let signature = decode_signature(signature_hex).ok_or("ERR_ATTESTATION")?;
    let text = signed_text(model, request.as_bytes(), response.as_bytes());
    let address = recover_address(text.as_bytes(), &signature).ok_or("ERR_ATTESTATION")?;
    if &address != tee_signer {
        return Err("ERR_ATTESTATION");
    }
    Ok(())
}

pub fn parse_address(hex_str: &str) -> Option<[u8; 20]> {
    let hex_str = hex_str.trim().trim_start_matches("0x").trim_start_matches("0X");
    <[u8; 20]>::from_hex(hex_str).ok()
}

fn signed_text(model: &str, request: &[u8], response: &[u8]) -> String {
    format!(
        "{model}:{}:{}",
        hex::encode(env::sha256_array(request)),
        hex::encode(env::sha256_array(response))
    )
}

fn recover_address(text: &[u8], signature: &[u8; 65]) -> Option<[u8; 20]> {
    let hash = eip191_hash(text);
    let v = match signature[64] {
        0 | 1 => signature[64],
        27 | 28 => signature[64] - 27,
        _ => return None,
    };
    let pubkey = env::ecrecover(&hash, &signature[..64], v, false)?;
    let digest = env::keccak256_array(&pubkey);
    let mut address = [0u8; 20];
    address.copy_from_slice(&digest[12..]);
    Some(address)
}

fn eip191_hash(text: &[u8]) -> [u8; 32] {
    let mut prefixed = format!("\u{19}Ethereum Signed Message:\n{}", text.len()).into_bytes();
    prefixed.extend_from_slice(text);
    env::keccak256_array(&prefixed)
}

fn decode_signature(hex_str: &str) -> Option<[u8; 65]> {
    let hex_str = hex_str.trim().trim_start_matches("0x").trim_start_matches("0X");
    <[u8; 65]>::from_hex(hex_str).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use k256::ecdsa::SigningKey;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn context() {
        testing_env!(VMContextBuilder::new().build());
    }

    #[test]
    fn a_body_without_the_line_is_refused() {
        context();
        let line = release_line(1, "vendor.mtrfc658fd1.testnet", 48_000_000, "ab");
        let error = check("z-ai/glm-5.3-flash", &[0u8; 20], &line, "{\"ok\":true}", "{\"ok\":true}", "00").unwrap_err();
        assert_eq!(error, "ERR_ATTEST_LINE");
    }

    #[test]
    fn a_signature_over_the_line_recovers_the_pinned_signer() {
        context();
        let secret = [7u8; 32];
        let key = SigningKey::from_slice(&secret).unwrap();
        let line = release_line(1, "vendor.mtrfc658fd1.testnet", 48_000_000, "ab");
        let request = format!("{{\"user\":\"{line}\"}}");
        let response = format!("{{\"content\":\"{line}\"}}");
        let text = signed_text("z-ai/glm-5.3-flash", request.as_bytes(), response.as_bytes());
        let hash = eip191_hash(text.as_bytes());
        let (signature, id) = key.sign_prehash_recoverable(&hash).unwrap();
        let mut bytes = [0u8; 65];
        bytes[..64].copy_from_slice(&signature.to_bytes());
        bytes[64] = id.to_byte() + 27;
        let address = recover_address(text.as_bytes(), &bytes).unwrap();
        check("z-ai/glm-5.3-flash", &address, &line, &request, &response, &hex::encode(bytes)).unwrap();
    }
}
