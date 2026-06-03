package tn.insat.tp3;

import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SparkSession;
import org.apache.spark.sql.api.java.UDF1;
import org.apache.spark.sql.streaming.OutputMode;
import org.apache.spark.sql.types.DataTypes;
import org.apache.spark.sql.types.StructType;

import static org.apache.spark.sql.functions.*;

public class StreamingAQI {

        public static void main(String[] args) throws Exception {
                // Initialize Spark Session
                SparkSession spark = SparkSession.builder()
                                .appName("Vietnam AQI Real-Time Streaming")
                                // master được truyền qua spark-submit --master spark://spark-master:7077
                                // Reduce shuffle partitions to match cluster size (2 workers × 2 cores)
                                .config("spark.sql.shuffle.partitions", "4")
                                .getOrCreate();

                // 1. Defining the Schema for incoming Kafka JSON Data
                StructType jsonSchema = new StructType()
                                .add("date", DataTypes.StringType)
                                .add("timestamp", DataTypes.TimestampType)
                                .add("station_id", DataTypes.StringType)
                                .add("pm25", DataTypes.DoubleType)
                                .add("temperature", DataTypes.DoubleType)
                                .add("humidity", DataTypes.DoubleType)
                                .add("no2", DataTypes.DoubleType);

                // 2. Read continuous stream from Kafka (internal Docker network)
                // Requirement 5: Structured Streaming
                Dataset<Row> kafkaStream = spark.readStream()
                                .format("kafka")
                                .option("kafka.bootstrap.servers",
                                                "kafka-0.kafka-headless.bigdata.svc.cluster.local:29092,kafka-1.kafka-headless.bigdata.svc.cluster.local:29092,kafka-2.kafka-headless.bigdata.svc.cluster.local:29092")
                                .option("subscribe", "vn_weather_stream")
                                .option("startingOffsets", "latest")
                                .load();

                // Parse JSON from Kafka value
                Dataset<Row> parsedStream = kafkaStream
                                .selectExpr("CAST(value AS STRING)")
                                .select(from_json(col("value"), jsonSchema).alias("data"))
                                .select("data.*");

                // 3. Load static Geography Data from HDFS (Distributed path)
                Dataset<Row> stationsDf = spark.read()
                                .option("header", "true")
                                .csv("hdfs://namenode:9000/user/data/static/vietnam_stations.csv");

                // Requirement 3: Broadcast Join (Highly Optimized)
                // Broadcasting the small CSV so all worker nodes check station_id instantly
                Dataset<Row> enrichedStream = parsedStream.join(broadcast(stationsDf), "station_id");

                // Requirement 2: Custom UDF to calculate actual AQI from PM2.5
                UDF1<Double, Integer> calculateAQI = (pm25) -> {
                        if (pm25 == null)
                                return 0;
                        double c = pm25;
                        if (c <= 12.0)
                                return (int) Math.round((50.0 / 12.0) * c);
                        if (c <= 35.4)
                                return (int) Math.round(((100.0 - 51.0) / (35.4 - 12.1)) * (c - 12.1) + 51.0);
                        if (c <= 55.4)
                                return (int) Math.round(((150.0 - 101.0) / (55.4 - 35.5)) * (c - 35.5) + 101.0);
                        if (c <= 150.4)
                                return (int) Math.round(((200.0 - 151.0) / (150.4 - 55.5)) * (c - 55.5) + 151.0);
                        if (c <= 250.4)
                                return (int) Math.round(((300.0 - 201.0) / (250.4 - 150.5)) * (c - 150.5) + 201.0);
                        if (c <= 350.4)
                                return (int) Math.round(((400.0 - 301.0) / (350.4 - 250.5)) * (c - 250.5) + 301.0);
                        if (c <= 500.4)
                                return (int) Math.round(((500.0 - 401.0) / (500.4 - 350.5)) * (c - 350.5) + 401.0);
                        return 500; // Hazardous/Beyond scale
                };
                spark.udf().register("pm25ToAQI", calculateAQI, DataTypes.IntegerType);

                // STREAM 1: Real-time per-station data with alert fields
                Dataset<Row> realtimeAlerts = enrichedStream
                                .withColumn("aqi_index", callUDF("pm25ToAQI", col("pm25")))
                                .withColumn("aqi_alert",
                                                when(col("aqi_index").leq(50), lit("Good"))
                                                                .when(col("aqi_index").leq(100), lit("Moderate"))
                                                                .when(col("aqi_index").leq(150),
                                                                                lit("Unhealthy for Sensitive Groups"))
                                                                .when(col("aqi_index").leq(200), lit("Unhealthy"))
                                                                .when(col("aqi_index").leq(300), lit("Very Unhealthy"))
                                                                .otherwise(lit("Hazardous")))
                                .withColumn("temp_alert",
                                                when(col("temperature").lt(10), lit("Too Cold"))
                                                                .when(col("temperature").leq(35), lit("Normal"))
                                                                .when(col("temperature").leq(40), lit("Hot"))
                                                                .otherwise(lit("Extreme Heat")));

                // STREAM 1 sink: RealTimeReadings — OVERRIDE one doc per station
                // (_id = station_id) so the snapshot collection stays at ~34 docs
                // (latest reading per station). Data thô KHÔNG còn ghi AQIStream_avg
                // nữa — AQIStream_avg giờ do STREAM 2 (hourly) đảm nhiệm.
                realtimeAlerts.writeStream()
                                .outputMode(OutputMode.Append())
                                .foreachBatch((batchDF, batchId) -> {
                                        if (!batchDF.isEmpty()) {
                                                // OVERRIDE: matching _id replaces the existing doc.
                                                batchDF.withColumn("_id", col("station_id"))
                                                                .write()
                                                                .format("mongo")
                                                                .mode("append")
                                                                .option("spark.mongodb.output.uri",
                                                                                "mongodb+srv://tuyen:tuyen@cluster0.tkzrw9q.mongodb.net/")
                                                                .option("spark.mongodb.output.database", "Big_Data")
                                                                .option("spark.mongodb.output.collection",
                                                                                "RealTimeReadings")
                                                                .save();
                                                System.out.println("Batch " + batchId
                                                                + " written to RealTimeReadings: "
                                                                + batchDF.count() + " records.");
                                        }
                                })
                                // Requirement 5: Exactly-once semantics via Checkpointing (trên HDFS cluster)
                                .option("checkpointLocation", "hdfs://namenode:9000/checkpoints/realtime_stream")
                                .start();

                // STREAM 2: Hourly windowed aggregation per station — nguồn cho biểu
                // đồ "xu hướng nhiệt độ trong 1 ngày" (24 điểm/ngày/trạm).
                // Watermark 10' = data đến trễ hơn 10 phút bị loại, không gộp vào window.
                Dataset<Row> hourlyAggregations = realtimeAlerts
                                .withWatermark("timestamp", "10 minutes")
                                .groupBy(
                                                window(col("timestamp"), "1 hour"),
                                                col("station_id"),
                                                col("province"))
                                .agg(
                                                // PM2.5: avg, max, min
                                                round(avg("pm25"), 2).alias("avg_pm25"),
                                                round(max("pm25"), 2).alias("max_pm25"),
                                                round(min("pm25"), 2).alias("min_pm25"),
                                                // Temperature: avg, max, min
                                                round(avg("temperature"), 1).alias("avg_temp"),
                                                round(max("temperature"), 1).alias("max_temp"),
                                                round(min("temperature"), 1).alias("min_temp"),
                                                // Humidity: avg, max, min
                                                round(avg("humidity"), 1).alias("avg_humidity"),
                                                round(max("humidity"), 1).alias("max_humidity"),
                                                round(min("humidity"), 1).alias("min_humidity"),
                                                // NO2: avg
                                                round(avg("no2"), 2).alias("avg_no2"),
                                                // AQI: avg, max (aqi_index đã tính ở realtimeAlerts)
                                                round(avg("aqi_index"), 0).alias("avg_aqi"),
                                                max("aqi_index").alias("max_aqi"))
                                // Cảnh báo AQI tính lại từ avg_aqi của cả window
                                .withColumn("aqi_alert",
                                                when(col("avg_aqi").leq(50), lit("Good"))
                                                                .when(col("avg_aqi").leq(100), lit("Moderate"))
                                                                .when(col("avg_aqi").leq(150),
                                                                                lit("Unhealthy for Sensitive Groups"))
                                                                .when(col("avg_aqi").leq(200), lit("Unhealthy"))
                                                                .when(col("avg_aqi").leq(300), lit("Very Unhealthy"))
                                                                .otherwise(lit("Hazardous")))
                                // Giờ VN = window.start (UTC) + 7h. Lưu vào 'timestamp' để
                                // API getUTCHours(timestamp) ra đúng giờ VN, và frontend
                                // clock() (format UTC) cũng hiện đúng giờ VN trên trục.
                                .withColumn("timestamp", expr("`window`.start + INTERVAL 7 HOURS"))
                                .withColumn("hour_end", expr("`window`.end + INTERVAL 7 HOURS"))
                                .drop("window")
                                // date theo NGÀY VN — API /hourly lọc theo field này.
                                .withColumn("date", date_format(col("timestamp"), "yyyy-MM-dd"))
                                // Map tên field sang chuẩn API/frontend mong đợi
                                // (temperature/humidity/pm25/no2/aqi_index). Giữ luôn các
                                // cột avg/max/min gốc (schema Mongo strict:false).
                                .withColumn("temperature", col("avg_temp"))
                                .withColumn("humidity", col("avg_humidity"))
                                .withColumn("pm25", col("avg_pm25"))
                                .withColumn("no2", col("avg_no2"))
                                .withColumn("aqi_index", col("avg_aqi"))
                                // temp_alert tính từ nhiệt độ trung bình của giờ
                                .withColumn("temp_alert",
                                                when(col("avg_temp").lt(10), lit("Too Cold"))
                                                                .when(col("avg_temp").leq(35), lit("Normal"))
                                                                .when(col("avg_temp").leq(40), lit("Hot"))
                                                                .otherwise(lit("Extreme Heat")))
                                // _id ổn định = station + giờ VN -> Update() ghi đè đúng doc,
                                // không tạo bản trùng khi window đang cập nhật.
                                .withColumn("_id", concat_ws("_", col("station_id"),
                                                date_format(col("timestamp"), "yyyy-MM-dd HH:mm:ss")));

                hourlyAggregations.writeStream()
                                // Update: giờ đang chạy vẫn cập nhật dần (không đợi chốt window).
                                .outputMode(OutputMode.Update())
                                .foreachBatch((batchDF, batchId) -> {
                                        if (!batchDF.isEmpty()) {
                                                batchDF.write()
                                                                .format("mongo")
                                                                .mode("append")
                                                                .option("spark.mongodb.output.uri",
                                                                                "mongodb+srv://tuyen:tuyen@cluster0.tkzrw9q.mongodb.net/")
                                                                .option("spark.mongodb.output.database", "Big_Data")
                                                                .option("spark.mongodb.output.collection",
                                                                                "AQIStream_avg")
                                                                .save();
                                                System.out.println("Hourly batch " + batchId
                                                                + " written to AQIStream_avg: "
                                                                + batchDF.count() + " windows.");
                                        }
                                })
                                // Checkpoint RIÊNG — path mới để tránh state cũ (hourly_agg).
                                .option("checkpointLocation", "hdfs://namenode:9000/checkpoints/aqi_hourly_vn")
                                .start();

                // Monitor both streams simultaneously — exits if either one fails
                spark.streams().awaitAnyTermination();
        }
}
