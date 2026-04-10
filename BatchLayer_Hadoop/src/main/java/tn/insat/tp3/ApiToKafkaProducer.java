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
                // IMPORTANT: Replace this URL with your custom Weather API!
                // Example:
                // "http://api.openweathermap.org/data/2.5/weather?q=Hanoi&appid=YOUR_API_KEY"
                URL url = new URL("https://api.coincap.io/v2/assets/bitcoin");
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
                JSONObject data = jsonResponse.getJSONObject("data");

                // Extract data from API (Mocking real weather metrics)
                double pm25Value = data.optDouble("priceUsd", 50.0) % 200;
                double temperature = 25.0 + (data.optDouble("priceUsd", 50.0) % 15);
                double humidity = 60.0 + (data.optDouble("vwap24Hr", 50.0) % 30);
                double no2 = 10.0 + (System.currentTimeMillis() % 40);

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

                // 3. Send message payload to Kafka
                producer.send(new ProducerRecord<>(topic, finalJsonString));
                System.out.println("Successfully sent JSON to Kafka Stream: " + finalJsonString);

                // Wait 4 seconds to avoid spamming the public API
                Thread.sleep(4000);

            } catch (Exception e) {
                System.err.println("API Connection/Parse Error: " + e.getMessage());
            }
        }
    }
}
