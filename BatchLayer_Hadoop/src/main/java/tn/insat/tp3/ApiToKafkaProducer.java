package tn.insat.tp3;

import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.Producer;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Properties;

public class ApiToKafkaProducer {

    public static void main(String[] args) {
        // 1. Configure Kafka Producer
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");

        Producer<String, String> producer = new KafkaProducer<>(props);

        // This is the EXACT topic that StreamingAQI.java expects to read from
        String topic = "vn_weather_stream";

        System.out.println("Starting Real Weather API fetcher to Kafka...");

        while (true) {
            try {
                // Use WeatherAPI.com (includes both Weather + PM2.5/NO2 Air Quality data)
                URL url = new URL("http://api.weatherapi.com/v1/current.json?key=a612c6e61fb347f38ed92614261104&q=Hanoi&aqi=yes");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");

                BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                String inputLine;
                StringBuilder content = new StringBuilder();
                while ((inputLine = in.readLine()) != null) {
                    content.append(inputLine);
                }
                in.close();
                conn.disconnect();

                // Parse the response
                JSONObject jsonResponse = new JSONObject(content.toString());
                JSONObject currentData = jsonResponse.getJSONObject("current");
                JSONObject airQuality = currentData.getJSONObject("air_quality");

                // Extract REAL data from API (Weather + AQI combined)
                double temperature = currentData.getDouble("temp_c");
                double humidity = currentData.getDouble("humidity");
                double pm25Value = airQuality.getDouble("pm2_5");
                double no2 = airQuality.getDouble("no2");
                
                System.out.println("Temperature: " + temperature);
                System.out.println("Humidity: " + humidity);
                System.out.println("PM2.5: " + pm25Value);
                System.out.println("NO2: " + no2);
                long timestamp = System.currentTimeMillis();
                String stationId = "HN01"; // Assigning to Hanoi Station

                // 2. Formatting the message as STRICT JSON
                JSONObject kafkaMessage = new JSONObject();
                kafkaMessage.put("date", new java.sql.Date(timestamp).toString());
                kafkaMessage.put("timestamp", new java.sql.Timestamp(timestamp).toString());
                kafkaMessage.put("station_id", stationId);
                kafkaMessage.put("pm25", pm25Value);
                kafkaMessage.put("temperature", temperature);
                kafkaMessage.put("humidity", humidity);
                kafkaMessage.put("no2", no2);


                String finalJsonString = kafkaMessage.toString();

                // 3. Send message payload to Kafka specifically to Partition 0
                int partition = 0;
                producer.send(new ProducerRecord<>(topic, partition, null, finalJsonString));
                System.out.println("Successfully sent JSON to Kafka Stream: " + finalJsonString);

                // Wait 4 seconds to avoid spamming the public API
                Thread.sleep(4000);

            } catch (Exception e) {
                System.err.println("API Connection/Parse Error: " + e.getMessage());
            }
        }
    }
}
