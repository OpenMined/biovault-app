use std::ffi::{CStr, CString, c_char};

#[cfg(target_os = "android")]
use jni::{
    JNIEnv,
    objects::{JClass, JString},
    sys::jstring,
};
use monty::{DictPairs, MontyObject, MontyRun, NoLimitTracker, PrintWriter};
use serde::Serialize;
use serde_json::{Map, Number, Value};

#[derive(Serialize)]
struct RunResponse {
    ok: bool,
    error: Option<String>,
    stdout: String,
    stderr: String,
    result: Value,
    metadata: Metadata,
}

#[derive(Serialize)]
struct Metadata {
    code_length: usize,
    input_keys: Vec<String>,
    runtime: &'static str,
    linked: bool,
}

#[no_mangle]
pub extern "C" fn expo_monty_run(code: *const c_char, inputs_json: *const c_char) -> *mut c_char {
    let response = run_code_c_strings(code, inputs_json);
    json_to_c_string(&response)
}

#[no_mangle]
pub extern "C" fn expo_monty_free_string(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }

    // SAFETY: the pointer was allocated by CString::into_raw in this library.
    unsafe {
        drop(CString::from_raw(ptr));
    }
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_expo_modules_monty_ExpoMontyNativeBridge_runCodeNative(
    mut env: JNIEnv,
    _class: JClass,
    code: JString,
    inputs_json: JString,
) -> jstring {
    let response = match (
        java_string_arg(&mut env, code, "code"),
        java_string_arg(&mut env, inputs_json, "inputsJson"),
    ) {
        (Ok(code), Ok(inputs_json)) => run_code(&code, &inputs_json),
        (Err(error), _) | (_, Err(error)) => error_response(error),
    };

    match env.new_string(json_to_string(&response)) {
        Ok(value) => value.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

fn run_code_c_strings(code: *const c_char, inputs_json: *const c_char) -> RunResponse {
    let code = match c_string_arg(code) {
        Ok(value) => value,
        Err(error) => return error_response(error),
    };

    let inputs_json = match c_string_arg(inputs_json) {
        Ok(value) => value,
        Err(error) => return error_response(error),
    };

    run_code(&code, &inputs_json)
}

fn run_code(code: &str, inputs_json: &str) -> RunResponse {
    let inputs_value = match inputs_json {
        value if value.trim().is_empty() => Value::Object(Map::new()),
        value => match serde_json::from_str::<Value>(value) {
            Ok(parsed) => parsed,
            Err(error) => return error_response(format!("invalid inputs JSON: {error}")),
        },
    };

    let inputs_object = match inputs_value {
        Value::Object(map) => map,
        _ => return error_response("inputs must be a JSON object".to_string()),
    };

    let input_keys = inputs_object.keys().cloned().collect::<Vec<_>>();
    let monty_inputs = match input_keys
        .iter()
        .map(|key| json_to_monty(inputs_object.get(key).expect("input key disappeared")))
        .collect::<Result<Vec<_>, _>>()
    {
        Ok(values) => values,
        Err(error) => return error_response(error),
    };

    let mut stdout = String::new();
    let runner = match MontyRun::new(code.to_owned(), "main.py", input_keys.clone()) {
        Ok(runner) => runner,
        Err(error) => {
            return RunResponse {
                ok: false,
                error: Some(error.to_string()),
                stdout,
                stderr: error.to_string(),
                result: Value::Null,
                metadata: Metadata {
                    code_length: code.len(),
                    input_keys,
                    runtime: "monty",
                    linked: true,
                },
            };
        }
    };

    match runner.run(monty_inputs, NoLimitTracker, PrintWriter::Collect(&mut stdout)) {
        Ok(result) => RunResponse {
            ok: true,
            error: None,
            stdout,
            stderr: String::new(),
            result: monty_to_json(&result),
            metadata: Metadata {
                code_length: code.len(),
                input_keys,
                runtime: "monty",
                linked: true,
            },
        },
        Err(error) => RunResponse {
            ok: false,
            error: Some(error.to_string()),
            stdout,
            stderr: error.to_string(),
            result: Value::Null,
            metadata: Metadata {
                code_length: code.len(),
                input_keys,
                runtime: "monty",
                linked: true,
            },
        },
    }
}

#[cfg(test)]
mod tests {
    use super::run_code;

    #[test]
    fn executes_simple_expression() {
        let response = run_code("x + y", r#"{"x":2,"y":3}"#);
        assert!(response.ok, "expected success, got {:?}", response.error);
        assert_eq!(response.result, serde_json::json!(5));
        assert!(response.metadata.linked);
    }

    #[test]
    fn captures_stdout() {
        let response = run_code("print('hello world')", "{}");
        assert!(response.ok, "expected success, got {:?}", response.error);
        assert_eq!(response.stdout, "hello world\n");
    }
}

fn c_string_arg(ptr: *const c_char) -> Result<String, String> {
    if ptr.is_null() {
        return Err("received null C string".to_string());
    }

    // SAFETY: caller must pass a valid, null-terminated C string.
    unsafe {
        CStr::from_ptr(ptr)
            .to_str()
            .map(|value| value.to_owned())
            .map_err(|error| format!("invalid UTF-8 string: {error}"))
    }
}

#[cfg(target_os = "android")]
fn java_string_arg(env: &mut JNIEnv, value: JString, field_name: &str) -> Result<String, String> {
    let value = env
        .get_string(&value)
        .map_err(|error| format!("invalid {field_name} string: {error}"))?;

    value
        .to_str()
        .map(|value| value.to_owned())
        .map_err(|error| format!("invalid UTF-8 in {field_name}: {error}"))
}

fn json_to_string<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_else(|error| {
        serde_json::json!({
            "ok": false,
            "error": format!("failed to serialize response: {error}"),
            "stdout": "",
            "stderr": "",
            "result": Value::Null,
            "metadata": {
                "code_length": 0,
                "input_keys": [],
                "runtime": "monty",
                "linked": false
            }
        })
        .to_string()
    })
}

fn json_to_c_string<T: Serialize>(value: &T) -> *mut c_char {
    let json = json_to_string(value);

    CString::new(json)
        .expect("response JSON unexpectedly contained interior NUL")
        .into_raw()
}

fn error_response(error: String) -> RunResponse {
    RunResponse {
        ok: false,
        error: Some(error.clone()),
        stdout: String::new(),
        stderr: error,
        result: Value::Null,
        metadata: Metadata {
            code_length: 0,
            input_keys: Vec::new(),
            runtime: "monty",
            linked: false,
        },
    }
}

fn json_to_monty(value: &Value) -> Result<MontyObject, String> {
    match value {
        Value::Null => Ok(MontyObject::None),
        Value::Bool(value) => Ok(MontyObject::Bool(*value)),
        Value::Number(value) => number_to_monty(value),
        Value::String(value) => Ok(MontyObject::String(value.clone())),
        Value::Array(values) => values
            .iter()
            .map(json_to_monty)
            .collect::<Result<Vec<_>, _>>()
            .map(MontyObject::List),
        Value::Object(map) => map
            .iter()
            .map(|(key, value)| Ok((MontyObject::String(key.clone()), json_to_monty(value)?)))
            .collect::<Result<Vec<_>, String>>()
            .map(DictPairs::from)
            .map(MontyObject::Dict),
    }
}

fn number_to_monty(number: &Number) -> Result<MontyObject, String> {
    if let Some(value) = number.as_i64() {
        return Ok(MontyObject::Int(value));
    }

    if let Some(value) = number.as_u64() {
        return i64::try_from(value)
            .map(MontyObject::Int)
            .map_err(|_| "u64 JSON numbers above i64::MAX are not supported yet".to_string());
    }

    if let Some(value) = number.as_f64() {
        return Ok(MontyObject::Float(value));
    }

    Err("unsupported JSON number".to_string())
}

fn monty_to_json(value: &MontyObject) -> Value {
    match value {
        MontyObject::Ellipsis => tagged_value("Ellipsis", Value::Null),
        MontyObject::None => Value::Null,
        MontyObject::Bool(value) => Value::Bool(*value),
        MontyObject::Int(value) => Value::Number(Number::from(*value)),
        MontyObject::BigInt(value) => Value::String(value.to_string()),
        MontyObject::Float(value) => Number::from_f64(*value)
            .map(Value::Number)
            .unwrap_or_else(|| Value::String(value.to_string())),
        MontyObject::String(value) => Value::String(value.clone()),
        MontyObject::Bytes(value) => Value::Array(
            value
                .iter()
                .map(|byte| Value::Number(Number::from(*byte)))
                .collect(),
        ),
        MontyObject::List(values) | MontyObject::Tuple(values) => {
            Value::Array(values.iter().map(monty_to_json).collect())
        }
        MontyObject::NamedTuple {
            type_name,
            field_names,
            values,
        } => {
            let mut object = Map::new();
            object.insert("__monty_type__".to_string(), Value::String("NamedTuple".to_string()));
            object.insert("typeName".to_string(), Value::String(type_name.clone()));
            object.insert(
                "fieldNames".to_string(),
                Value::Array(field_names.iter().cloned().map(Value::String).collect()),
            );
            object.insert(
                "values".to_string(),
                Value::Array(values.iter().map(monty_to_json).collect()),
            );
            Value::Object(object)
        }
        MontyObject::Dict(pairs) => {
            let mut string_keyed = Map::new();
            let mut non_string_keyed = Vec::new();

            for (key, value) in pairs {
                match key {
                    MontyObject::String(key) => {
                        string_keyed.insert(key.clone(), monty_to_json(value));
                    }
                    _ => {
                        non_string_keyed.push(Value::Array(vec![monty_to_json(key), monty_to_json(value)]));
                    }
                }
            }

            if non_string_keyed.is_empty() {
                Value::Object(string_keyed)
            } else {
                let mut object = Map::new();
                object.insert("__monty_type__".to_string(), Value::String("Dict".to_string()));
                object.insert("stringKeys".to_string(), Value::Object(string_keyed));
                object.insert("entries".to_string(), Value::Array(non_string_keyed));
                Value::Object(object)
            }
        }
        MontyObject::Set(values) => tagged_value(
            "Set",
            Value::Array(values.iter().map(monty_to_json).collect()),
        ),
        MontyObject::FrozenSet(values) => tagged_value(
            "FrozenSet",
            Value::Array(values.iter().map(monty_to_json).collect()),
        ),
        MontyObject::Date(value) => tagged_value("Date", serde_json::to_value(value).unwrap_or(Value::Null)),
        MontyObject::DateTime(value) => {
            tagged_value("DateTime", serde_json::to_value(value).unwrap_or(Value::Null))
        }
        MontyObject::TimeDelta(value) => {
            tagged_value("TimeDelta", serde_json::to_value(value).unwrap_or(Value::Null))
        }
        MontyObject::TimeZone(value) => {
            tagged_value("TimeZone", serde_json::to_value(value).unwrap_or(Value::Null))
        }
        MontyObject::Exception { exc_type, arg } => {
            let mut object = Map::new();
            object.insert("__monty_type__".to_string(), Value::String("Exception".to_string()));
            object.insert("excType".to_string(), Value::String(exc_type.to_string()));
            object.insert(
                "message".to_string(),
                arg.as_ref().map(|message| Value::String(message.clone())).unwrap_or(Value::Null),
            );
            Value::Object(object)
        }
        MontyObject::Type(value) => tagged_value("Type", Value::String(value.to_string())),
        MontyObject::BuiltinFunction(value) => tagged_value("BuiltinFunction", Value::String(value.to_string())),
        MontyObject::Path(value) => tagged_value("Path", Value::String(value.clone())),
        MontyObject::Dataclass {
            name,
            type_id,
            field_names,
            attrs,
            frozen,
        } => {
            let mut object = Map::new();
            object.insert("__monty_type__".to_string(), Value::String("Dataclass".to_string()));
            object.insert("name".to_string(), Value::String(name.clone()));
            object.insert("typeId".to_string(), Value::Number(Number::from(*type_id)));
            object.insert(
                "fieldNames".to_string(),
                Value::Array(field_names.iter().cloned().map(Value::String).collect()),
            );
            object.insert("attrs".to_string(), monty_to_json(&MontyObject::Dict(attrs.clone())));
            object.insert("frozen".to_string(), Value::Bool(*frozen));
            Value::Object(object)
        }
        MontyObject::Function { name, docstring } => {
            let mut object = Map::new();
            object.insert("__monty_type__".to_string(), Value::String("Function".to_string()));
            object.insert("name".to_string(), Value::String(name.clone()));
            object.insert(
                "docstring".to_string(),
                docstring
                    .as_ref()
                    .map(|value| Value::String(value.clone()))
                    .unwrap_or(Value::Null),
            );
            Value::Object(object)
        }
        MontyObject::Repr(value) => tagged_value("Repr", Value::String(value.clone())),
        MontyObject::Cycle(_, value) => tagged_value("Cycle", Value::String(value.clone())),
    }
}

fn tagged_value(type_name: &str, value: Value) -> Value {
    let mut object = Map::new();
    object.insert("__monty_type__".to_string(), Value::String(type_name.to_string()));
    object.insert("value".to_string(), value);
    Value::Object(object)
}
