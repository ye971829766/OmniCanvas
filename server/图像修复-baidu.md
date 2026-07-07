接口说明
向授权服务地址 https://aip.baidubce.com/oauth/2.0/token 发送请求（推荐使用POST）。

请求URI
POST /oauth/2.0/token

参数名称 参数类型 是否必须 描述 示例值
grant_type string 是 固定为client_credentials client_credentials
client_id string 是 应用的API Key，获取方式：https://ai.baidu.com/ai-doc/REFERENCE/Ck3dwjgn3 Va5yQRHlA4Fq5eR3LT0vuXV4
client_secret string 是 应用的Secret Key，获取方式：https://ai.baidu.com/ai-doc/REFERENCE/Ck3dwjgn3 0rDSjzQ20XUj5itV6WRtznPQSzr5pVw2
响应体参数
响应体字段数据结构说明
参数名称 参数类型 描述
access_token string 要获取的Access Token
refresh_token string 该参数忽略
expires_in string Access Token的有效期(秒为单位，有效期30天)
scope string 该参数忽略
session_key string 该参数忽略
session_secret string 该参数忽略
错误码
错误码 错误描述 HTTP状态码 中文解释
invalid_client unknown client id 200 API Key不正确
invalid_client Client authentication failed 200 Secret Key不正确

接口描述
在图片中指定位置框定一个规则矩形，去掉不需要的遮挡物，并用背景内容填充，提高图像质量。示意图如下：
611.png

在线调试
您可以在 示例代码中心 中调试该接口，可进行签名验证、查看在线调用的请求内容和返回结果、示例代码的自动生成。

请求说明
请求示例

HTTP 方法：POST

请求URL： https://aip.baidubce.com/rest/2.0/image-process/v1/inpainting

URL参数：

参数 值
access_token 通过API Key和Secret Key获取的access_token，参考”Access Token获取”
Header如下：

参数 值
Content-Type application/json
Body中放置请求参数，参数详情如下：

请求参数

参数 是否必选 类型 可选值范围 说明
rectangle true array[] - 要去除的位置为规则矩形时，给出坐标信息，每个元素包含left, top, width, height，int 类型。如： [{'width': 92, 'top': 25, 'height': 36, 'left': 543}] 注意：上传宽高、位置坐标参数要比图片实际宽高小
image 和url二选一 string - 被修复的图片base64编码后大小不超过10M(参考：原图大约为8M以内），最短边至少10px，最长边最大5000px，长宽比4：1以内。注意：图片的base64编码是不包含图片头的，如（data:image/jpg;base64,）
url 和image二选一 string - 图片完整URL，URL长度不超过1024字节，URL对应的图片base64编码后大小不超过10M(参考：原图大约为8M以内），最短边至少10px，最长边最大5000px，长宽比4：1以内，支持jpg/png/bmp格式，当image字段存在时url字段失效。
请求代码示例

提示一：使用示例代码前，请记得替换其中的示例Token、图片地址或Base64信息。

提示二：部分语言依赖的类或库，请在代码注释中查看下载地址。

copy code

```bash
# 图像修复
curl -i -k 'https://aip.baidubce.com/rest/2.0/image-process/v1/inpainting?access_token=【调用鉴权接口获取的token】' --data '{"rectangle":[{"width":92,"top":95,"height":36,"left":543}],"image":"图片base64编码"}' -H 'Content-Type:application/json; charset=UTF-8'
```

```PHP
<?php
/**
 * 发起http post请求(REST API), 并获取REST请求的结果
 * @param string $url
 * @param string $param
 * @return - http response body if succeeds, else false.
 */
function request_post($url = '', $param = '')
{
    if (empty($url) || empty($param)) {
        return false;
    }

    $postUrl = $url;
    $curlPost = $param;
    // 初始化curl
    $curl = curl_init();
    curl_setopt($curl, CURLOPT_URL, $postUrl);
    curl_setopt($curl, CURLOPT_HEADER, 0);
    // 要求结果为字符串且输出到屏幕上
    curl_setopt($curl, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($curl, CURLOPT_SSL_VERIFYPEER, false);
    // post提交方式
    curl_setopt($curl, CURLOPT_POST, 1);
    curl_setopt($curl, CURLOPT_POSTFIELDS, $curlPost);
    // 运行curl
    $data = curl_exec($curl);
    curl_close($curl);

    return $data;
}

$token = '[调用鉴权接口获取的token]';
$url = 'https://aip.baidubce.com/rest/2.0/image-process/v1/inpainting?access_token=' . $token;
$bodys = "{\"rectangle\":[{\"width\":92,\"top\":95,\"height\":36,\"left\":543}],\"image\":\"图片base64编码\"}"
$res = request_post($url, $bodys);

var_dump($res);


```

```Java
package com.baidu.ai.aip;

import com.baidu.ai.aip.utils.HttpUtil;
import com.baidu.ai.aip.utils.GsonUtils;

import java.util.*;

/**
* 图像修复
*/
public class Inpainting {

    /**
    * 重要提示代码中所需工具类
    * FileUtil,Base64Util,HttpUtil,GsonUtils请从
    * https://ai.baidu.com/file/658A35ABAB2D404FBF903F64D47C1F72
    * https://ai.baidu.com/file/C8D81F3301E24D2892968F09AE1AD6E2
    * https://ai.baidu.com/file/544D677F5D4E4F17B4122FBD60DB82B3
    * https://ai.baidu.com/file/470B3ACCA3FE43788B5A963BF0B625F3
    * 下载
    */
    public static String inpainting() {
        // 请求url
        String url = "https://aip.baidubce.com/rest/2.0/image-process/v1/inpainting";
        try {
            Map<String, Object> map = new HashMap<>();
            map.put("image", "图片base64编码");
            List<Object> rectangle = new ArrayList<>();
            Map<String, Object> rectangleMap = new HashMap<>();
            rectangleMap.put("top", 95);
            rectangleMap.put("left", 543);
            rectangleMap.put("width", 92);
            rectangleMap.put("height", 36);
            rectangle.add(rectangleMap);
            map.put("rectangle", rectangle);

            String param = GsonUtils.toJson(map);

            // 注意这里仅为了简化编码每一次请求都去获取access_token，线上环境access_token有过期时间， 客户端可自行缓存，过期后重新获取。
            String accessToken = "[调用鉴权接口获取的token]";

            String result = HttpUtil.post(url, accessToken, "application/json", param);
            System.out.println(result);
            return result;
        } catch (Exception e) {
            e.printStackTrace();
        }
        return null;
    }

    public static void main(String[] args) {
        Inpainting.inpainting();
    }
}
```

```Python
# encoding:utf-8

import requests

'''
图像修复
'''

request_url = "https://aip.baidubce.com/rest/2.0/image-process/v1/inpainting"

params = "{\"rectangle\":[{\"width\":92,\"top\":95,\"height\":36,\"left\":543}],\"image\":\"图片base64编码\"}"
access_token = '[调用鉴权接口获取的token]'
request_url = request_url + "?access_token=" + access_token
headers = {'content-type': 'application/json'}
response = requests.post(request_url, data=params, headers=headers)
if response:
    print (response.json())


```

```CPP
#include <iostream>
#include <curl/curl.h>

// libcurl库下载链接：https://curl.haxx.se/download.html
// jsoncpp库下载链接：https://github.com/open-source-parsers/jsoncpp/
const static std::string request_url = "https://aip.baidubce.com/rest/2.0/image-process/v1/inpainting";
static std::string inpainting_result;
/**
 * curl发送http请求调用的回调函数，回调函数中对返回的json格式的body进行了解析，解析结果储存在全局的静态变量当中
 * @param 参数定义见libcurl文档
 * @return 返回值定义见libcurl文档
 */
static size_t callback(void *ptr, size_t size, size_t nmemb, void *stream) {
    // 获取到的body存放在ptr中，先将其转换为string格式
    inpainting_result = std::string((char *) ptr, size * nmemb);
    return size * nmemb;
}
/**
 * 图像修复
 * @return 调用成功返回0，发生错误返回其他错误码
 */
int inpainting(std::string &json_result, const std::string &access_token) {
    std::string url = request_url + "?access_token=" + access_token;
    CURL *curl = NULL;
    CURLcode result_code;
    int is_success;
    curl = curl_easy_init();
    if (curl) {
        curl_easy_setopt(curl, CURLOPT_URL, url.data());
        curl_easy_setopt(curl, CURLOPT_POST, 1);
        curl_slist *headers = NULL;
        headers = curl_slist_append(headers, "Content-Type:application/json;charset=UTF-8");
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, "{\"rectangle\":[{\"width\":92,\"top\":95,\"height\":36,\"left\":543}],\"image\":\"图片base64编码\"}");
        result_code = curl_easy_perform(curl);
        if (result_code != CURLE_OK) {
            fprintf(stderr, "curl_easy_perform() failed: %s\n",
                    curl_easy_strerror(result_code));
            is_success = 1;
            return is_success;
        }
        json_result = inpainting_result;
        curl_easy_cleanup(curl);
        is_success = 0;
    } else {
        fprintf(stderr, "curl_easy_init() failed.");
        is_success = 1;
    }
    return is_success;
}

```

```Cpp label=C#
using System;
using System.IO;
using System.Net;
using System.Text;
using System.Web;

namespace com.baidu.ai
{
    public class Inpainting
    {
        // 图像修复
        public static string inpainting()
        {
            string token = "[调用鉴权接口获取的token]";
            string host = "https://aip.baidubce.com/rest/2.0/image-process/v1/inpainting?access_token=" + token;
            Encoding encoding = Encoding.Default;
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(host);
            request.Method = "post";
            request.KeepAlive = true;
            String str = "{\"rectangle\":[{\"width\":92,\"top\":95,\"height\":36,\"left\":543}],\"image\":\"图片base64编码\"}";
            byte[] buffer = encoding.GetBytes(str);
            request.ContentLength = buffer.Length;
            request.GetRequestStream().Write(buffer, 0, buffer.Length);
            HttpWebResponse response = (HttpWebResponse)request.GetResponse();
            StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.Default);
            string result = reader.ReadToEnd();
            Console.WriteLine("图像修复:");
            Console.WriteLine(result);
            return result;
        }
    }
}


```

返回说明
返回参数

字段 是否必选 类型 说明
log_id 是 uint64 唯一的log id，用于问题定位
image 是 string 修复后的base64编码图片
返回示例

copy code
{
"log_id": "6876747463538438254",
"image": ”处理后图片的Base64编码“
}
